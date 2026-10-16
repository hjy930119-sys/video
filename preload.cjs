const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('studio',{
 testPointer:input=>ipcRenderer.invoke('testPointer',input),
 pick:kind=>ipcRenderer.invoke('pick',kind),importPaths:paths=>ipcRenderer.invoke('importPaths',paths),
 filePath:file=>webUtils.getPathForFile(file),fonts:()=>ipcRenderer.invoke('fonts'),shortcut:()=>ipcRenderer.invoke('shortcut'),
 save:p=>ipcRenderer.invoke('save',p),open:()=>ipcRenderer.invoke('open'),autosave:p=>ipcRenderer.invoke('autosave',p),recover:()=>ipcRenderer.invoke('recover'),
 export:p=>ipcRenderer.invoke('export',p),cancel:()=>ipcRenderer.invoke('cancel'),progress:fn=>ipcRenderer.on('progress',(_e,v)=>fn(v))
});
