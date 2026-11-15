(function(){
 const key='tch-theme';
 const allowed=['haldi','gulabi','neel'];
 function apply(value){
  const theme=allowed.includes(value)?value:'haldi';
  if(theme==='haldi') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme',theme);
  document.querySelectorAll('[data-theme-picker]').forEach(el=>el.value=theme);
 }
 let saved='haldi';
 try{saved=localStorage.getItem(key)||'haldi'}catch(e){}
 apply(saved);
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-theme-picker]').forEach(el=>{
   el.value=saved;
   el.addEventListener('change',()=>{
    const next=el.value;
    apply(next);
    try{localStorage.setItem(key,next)}catch(e){}
   });
  });
 });
})();