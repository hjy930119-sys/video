const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studio',{
 pick:kind=>ipcRenderer.invoke('pick',kind), save:p=>ipcRenderer.invoke('save',p), open:()=>ipcRenderer.invoke('open'),
 export:p=>ipcRenderer.invoke('export',p),cancel:()=>ipcRenderer.invoke('cancel'),
 progress:fn=>{ipcRenderer.on('progress',(_e,v)=>fn(v));},
});
