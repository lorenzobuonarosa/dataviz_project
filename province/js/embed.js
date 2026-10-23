(function(){
function send(){var h=document.documentElement.scrollHeight;try{parent.postMessage({type:'pv-height',height:h},'*');}catch(e){}}
if(window.ResizeObserver)new ResizeObserver(send).observe(document.body);
window.addEventListener('load',send);setTimeout(send,500);
})();
