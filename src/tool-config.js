export const toolConnections=config=>config?.connections??(config?[{profileId:config.profileId,models:config.models}]:[]);
export const modelsForProfile=(config,id)=>toolConnections(config).find(c=>c.profileId===id)?.models??[];
