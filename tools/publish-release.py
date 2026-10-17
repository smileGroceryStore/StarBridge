"""Publish tested local release artifacts using Git's existing GitHub credential.

Never writes or prints the credential. Default creates/updates a draft; --publish
is the final step after every asset has uploaded and its digest has been checked.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--tag', required=True)
parser.add_argument('--notes', required=True)
parser.add_argument('--asset', action='append', required=True)
parser.add_argument('--proxy')
parser.add_argument('--publish', action='store_true')
args = parser.parse_args()
repo = 'smileGroceryStore/StarBridge'
if not __import__('re').fullmatch(r'v\d+\.\d+\.\d+', args.tag):
    raise SystemExit('Invalid version tag')
assets = [pathlib.Path(p).resolve(strict=True) for p in args.asset]
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], text=True).strip()
if remote.rstrip('/').removesuffix('.git') != 'https://github.com/' + repo:
    raise SystemExit('Unexpected repository')
credential = os.environ.get('GITHUB_TOKEN')
if not credential:
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True)
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    credential = values.get('password')
if not credential:
    raise SystemExit('GitHub credential unavailable; sign in to GitHub through Git first')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Unexpected redirect on authenticated GitHub request')

handlers = [NoRedirect()]
if args.proxy:
    handlers.append(urllib.request.ProxyHandler({'http': args.proxy, 'https': args.proxy}))
opener = urllib.request.build_opener(*handlers)

def request(method, url, body=None, content_type='application/json'):
    if urllib.parse.urlsplit(url).hostname not in ('api.github.com', 'uploads.github.com'):
        raise RuntimeError('Unexpected authenticated host')
    data = json.dumps(body, ensure_ascii=False).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': 'Bearer ' + credential, 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Starbridge-release', 'Content-Type': content_type,
    })
    try:
        with opener.open(req, timeout=240) as response:
            payload=response.read();return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise RuntimeError('GitHub API returned HTTP ' + str(error.code)) from None

base = 'https://api.github.com/repos/' + repo
releases = request('GET', base + '/releases?per_page=30')
release = next((r for r in releases if r['tag_name'] == args.tag or r.get('name') == '星桥 Starbridge ' + args.tag), None)
notes = pathlib.Path(args.notes).read_text(encoding='utf-8-sig')
if release and not release['draft'] and not release['tag_name'].startswith('untagged-'):
    raise SystemExit('This tag is already published; use a new version')
if not release:
    release = request('POST', base + '/releases', {'tag_name': args.tag, 'target_commitish': commit, 'name': '星桥 Starbridge ' + args.tag, 'body': notes, 'draft': True, 'prerelease': False})
else:
    release = request('PATCH', base + '/releases/' + str(release['id']), {'body': notes, 'tag_name': args.tag, 'target_commitish': commit})
for file in assets:
    content = file.read_bytes()
    digest = 'sha256:' + hashlib.sha256(content).hexdigest()
    existing = next((a for a in release['assets'] if a['name'] == file.name), None)
    if existing:
        if existing.get('digest') == digest and existing['size'] == len(content):
            continue
        request('DELETE', base + '/releases/assets/' + str(existing['id']))
    upload = release['upload_url'].split('{')[0] + '?' + urllib.parse.urlencode({'name': file.name})
    asset = request('POST', upload, content, 'application/octet-stream')
    if asset['size'] != len(content) or (asset.get('digest') and asset['digest'] != digest):
        raise RuntimeError('Uploaded asset digest or size mismatch; draft remains unpublished')
    print(json.dumps({'asset': file.name, 'bytes': asset['size'], 'digestVerified': asset.get('digest') == digest}))
if args.publish:
    release = request('PATCH', base + '/releases/' + str(release['id']), {'draft': False, 'make_latest': 'true', 'tag_name': args.tag, 'target_commitish': commit})
print(json.dumps({'url': release['html_url'], 'draft': release['draft'], 'commit': commit}))
