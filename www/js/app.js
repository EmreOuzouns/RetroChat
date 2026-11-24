const $=id=>document.getElementById(id);
function uid(){return Math.random().toString(36).slice(2,10)}
const rp=()=>Array.from({length:8},()=>"0123456789ABCDEF"[Math.random()*16|0]).join("");
let st={pin:rp(),np:"Queen - Bohemian Rhapsody",friends:[{n:"Zeynep",s:"on",e:"👩",pin:rp(),np:"Tarkan - Kuzu Kuzu",h:[{me:0,t:"Toplantı kaçtaydı?",at:"15:30"}],u:10},{n:"Mehmet",s:"busy",e:"👨",pin:rp(),np:"",h:[{me:0,t:"Günaydın! ☀️",at:"15:30"}],u:12},{n:"Ayşe",s:"off",e:"👩‍🦰",pin:rp(),np:"",ls:"bugün 09:41",h:[]}]};
{let x=null,y=null;try{x=JSON.parse(localStorage.getItem("rc")||"null")}catch(e){}try{y=window.__NATIVE_STATE?JSON.parse(window.__NATIVE_STATE):null}catch(e){}if(y&&(!x||(y._t||0)>(x._t||0)))x=y;if(x&&x.friends)st=x}
RetroTransport.ensureIdentity(st);
let _nT=null,_iT=null;
function nativeFlush(){clearTimeout(_nT);_nT=null;if(window.ReactNativeWebView){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"state",data:JSON.stringify(st)}))}catch(e){}}}
function idbSave(str){try{const r=indexedDB.open("rc",1);r.onupgradeneeded=()=>r.result.createObjectStore("s");r.onsuccess=()=>{try{r.result.transaction("s","readwrite").objectStore("s").put(str,"st")}catch(e){}}}catch(e){}}
const save=()=>{try{const n=Date.now();st.friends.forEach(f=>f.h.forEach(m=>{if(!m.ts)m.ts=n}))}catch(e){}st._t=Date.now();let str="";try{str=JSON.stringify(st)}catch(e){return}try{localStorage.setItem("rc",str)}catch(e){}clearTimeout(_iT);_iT=setTimeout(()=>idbSave(str),400);if(window.ReactNativeWebView){clearTimeout(_nT);_nT=setTimeout(nativeFlush,250)}};
window.addEventListener("pagehide",()=>{save();nativeFlush()});
document.addEventListener("visibilitychange",()=>{if(document.hidden){save();nativeFlush()}});
st.set=Object.assign({name:"Ahmet",status:"on",sound:true,vol:60,shake:true,int:100,vib:true,read:true,col:"#00e5ff",stx:"Ay dolar gecelerine",song:"Queen - Bohemian Rhapsody",mus:false},st.set||{});st.friends.forEach(f=>f.h.forEach(m=>{if(!m.id)m.id=uid();if(m.me&&m.st==null)m.st=2}));let sel=0;$("mypin").textContent=st.pin;
(function(){try{const r=indexedDB.open("rc",1);r.onupgradeneeded=()=>r.result.createObjectStore("s");r.onsuccess=()=>{try{const g=r.result.transaction("s").objectStore("s").get("st");g.onsuccess=()=>{const v=g.result;if(!v)return;let y;try{y=JSON.parse(v)}catch(e){return}if(y&&y.friends&&(y._t||0)>(st._t||0)+1000){try{localStorage.setItem("rc",v)}catch(e){return}if(!String(window.name).includes("rcr")){window.name+=" rcr";location.reload()}}}}catch(e){}}}catch(e){}})();
save();
let ac;function beep(){if(!st.set.sound)return;try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();[520,390,520,390,620].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type="square";o.frequency.value=f;g.gain.value=.25*st.set.vol/100;o.connect(g);g.connect(ac.destination);o.start(ac.currentTime+i*.09);o.stop(ac.currentTime+i*.09+.08)})}catch(e){}}
function buzz(){RetroHaptics.nudge(st.set.vib)}
function shake(){if(!st.set.shake){beep();buzz();return}const a=$("app"),b=document.body;a.style.setProperty("--k",st.set.int/100);a.classList.remove("shake");b.classList.remove("flash");void a.offsetWidth;a.classList.add("shake");b.classList.add("flash");setTimeout(()=>{a.classList.remove("shake");b.classList.remove("flash")},900);beep();buzz()}
const t=()=>new Date().toTimeString().slice(0,5);
const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function myAv(){const c=st.set;if(c.photo)return `<img src="${c.photo}">`;if(c.emo)return `<span class="ea${c.anim&&c.anim!="none"?" an-"+c.anim:""}">${c.emo}</span>`;return "😎"}
const vmem={};
const calls={};
const stc=(f,own)=>{const c=calls[f.pin];return c&&c.on?(c.t=="video"?"vid":"voi"):(own?st.set.status:f.s)};
const fmtT=ms=>{const q=Math.floor(ms/1000);return String(Math.floor(q/60)).padStart(2,"0")+":"+String(q%60).padStart(2,"0")};
function toast(x){const e=$("toast");e.textContent=x;e.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>e.style.opacity=0,2200)}
function updCbar(){const f=st.friends[sel],c=calls[f.pin],b=$("cbar");$("mtS").classList.toggle("act",!!c&&c.t=="voice");$("mtG").classList.toggle("act",!!c&&c.t=="video");if(!c){b.style.display="none";return}b.style.display="flex";b.className=c.t;const v=c.t=="video";b.innerHTML=`<span>${v?"🎥":"📞"} ${c.on?esc(f.n)+" ile "+(v?"görüntülü":"sesli")+" görüşme · "+fmtT(Date.now()-c.start):esc(f.n)+" aranıyor…"}</span><button onclick="endCall(st.friends[sel])">Bitir</button>`}
function endCall(f){const c=calls[f.pin];if(!c)return;ringStop();clearInterval(c.iv);delete calls[f.pin];if(c.on){f.h.push({k:"c",id:uid(),txt:(c.t=="video"?"🎥 Görüntülü":"📞 Sesli")+" görüşme sona erdi · "+fmtT(Date.now()-c.start)});logCall(f,c.t,"out",Date.now()-c.start,c.start);save()}else logCall(f,c.t,"noans");renderMsgs()}
function startCall(ty){const f=st.friends[sel],c=calls[f.pin];if(c&&c.t==ty){endCall(f);return}if(c)endCall(f);if(f.s=="off"){logCall(f,ty,"noans");return toast(f.n+" offline, aranamaz")};if(f.s=="busy"){logCall(f,ty,"noans");return toast(f.n+" meşgul, aramayı açmadı")};const o={t:ty,on:false,start:0};calls[f.pin]=o;if(st.set.sound)ringPlay(ty=="video"?st.set.ringG:st.set.ringV,2);renderMsgs();setTimeout(()=>{if(calls[f.pin]!==o)return;ringStop();o.on=true;o.start=Date.now();o.iv=setInterval(updCbar,1000);renderMsgs()},1800)}
const avH=f=>f.photo?`<img src="${f.photo}">`:f.e;
let replyTo=null,typing={};
const lastOf=f=>{for(let i=f.h.length-1;i>=0;i--)if(!f.h[i].del)return f.h[i];return null};
const tk=m=>m.me&&m.k!="n"?`<span class="tk ${m.st==2&&st.set.read?"rd":""}"><svg viewBox="0 0 18 10" width="${m.st>=1?18:12}" height="10"><path d="M1 5.5l3 3L10 1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>${m.st>=1?'<path d="M7 5.5l3 3L16 1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>':""}</svg></span>`:"";
const colp={on:0,off:0};
function row(f,i){const l=lastOf(f);const cc=calls[f.pin];const sub=cc&&cc.on?(cc.t=="video"?'<svg class="si" viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2.5" fill="currentColor"/><path d="M16 10l6-3v10l-6-3z" fill="currentColor"/></svg>Görüntülü görüşmede':'<svg class="si" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="currentColor"/></svg>Sesli görüşmede'):typing[f.pin]?'<span style="color:var(--cy)">yazıyor…</span>':l?(l.k=="c"?l.txt:l.k=="n"?"😵‍💫 Titreşim":(l.me?tk(l)+" ":"")+(l.med?medLabel(l):l.img?"📷 Fotoğraf":esc(l.t||""))):(f.np?"🎵 "+esc(f.np):"");return `<div class="c ${i==sel?"sel":""}" onclick="pick(${i})"><div class="av ${stc(f)}" onclick="event.stopPropagation();openPF(${i})">${avH(f)}</div><div class="ci"><b>${esc(f.n)}</b><small>${sub||"..."}</small></div><div class="cr"><span class="tm">${l&&l.at||""}</span>${f.u?`<span class="bdg">${f.u}</span>`:""}</div><svg class="ch" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
function tgl(g){colp[g]=!colp[g];renderList()}
function renderList(){const q=($("q").value||"").toLowerCase();const items=st.friends.map((f,i)=>({f,i})).filter(o=>o.f.n.toLowerCase().includes(q)||o.f.pin.toLowerCase().includes(q));const G=[["on","ONLINE","#00e676",items.filter(o=>o.f.s!="off")],["off","OFFLINE","#8b90b5",items.filter(o=>o.f.s=="off")]];$("list").innerHTML=G.filter(g=>g[3].length).map(g=>{const u=g[3].reduce((n,o)=>n+(o.f.u||0),0);return `<div class="gh" onclick="tgl('${g[0]}')"><span class="gd" style="color:${g[2]};background:${g[2]}"></span> ${g[1]} (${g[3].length})${colp[g[0]]&&u?`<span class="bdg">${u}</span>`:""}<span class="ga">${colp[g[0]]?"▸":"▾"}</span></div>`+(colp[g[0]]?"":g[3].map(o=>row(o.f,o.i)).join(""))}).join("")||'<div style="padding:14px;opacity:.6;font-size:13px">Kişi bulunamadı</div>'}
function renderMsgs(){const f=st.friends[sel];
$("cav").className="fr "+stc(f);$("cav").innerHTML=`<div class="fi">${avH(f)}</div>`;
$("mav").className="fr "+stc(f,1);$("mav").innerHTML=`<div class="fi">${myAv()}</div>`;
$("hn").textContent=f.n;{const c=calls[f.pin],ca=c&&c.on;$("hst").className=ca?"on":f.s;$("hst").innerHTML='<i class="hdot"></i>'+(ca?(c.t=="video"?"Görüntülü görüşmede":"Sesli görüşmede"):({on:"Çevrimiçi",busy:"Meşgul",off:"Çevrimdışı"})[f.s])}
$("hs").innerHTML=typing[f.pin]?"yazıyor…":f.np?'<svg class="si" viewBox="0 0 24 24" style="opacity:1"><defs><linearGradient id="npg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4fe3e0"/><stop offset="1" stop-color="var(--t158,#a78bfa)"/></linearGradient></defs><path d="M9 18V6l11-2v12" fill="none" stroke="url(#npg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6.5" cy="18" rx="3" ry="2.4" fill="none" stroke="url(#npg)" stroke-width="2"/><ellipse cx="17.5" cy="16" rx="3" ry="2.4" fill="none" stroke="url(#npg)" stroke-width="2"/></svg>Şu an dinliyor: '+esc(f.np):f.s=="off"?"Son görülme: "+esc(f.ls||"yakınlarda"):(f.bio!=null?esc(f.bio):"");$("hp").innerHTML='<svg class="pw" viewBox="0 0 16 16"><path d="M2 8v0M5 5v6M8 3v10M11 6v4M14 8v0" stroke="var(--t159,#7a86d8)" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>PIN: '+esc(f.pin)+'<svg class="pc" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
let html=st.set.timed?'<div class="nd">⏳ Süreli mesajlar açık: 24 saat konuşulmazsa mesajlar herkesten silinir</div>':"",last=null,lastRecv=null;
f.h.forEach(m=>{if(m.k=="c"){html+=`<div class="nd">${esc(m.txt)}</div>`;last=null;return}if(m.k=="n"){html+=`<div class="nd">${m.me?"Titreşim Gönderdin 😍":"Titreşim Alındı 🤓"}</div>`;last=null;return}
if(last!==m.me){html+=`<div class="who${m.me?" mine":""}">${esc(m.me?st.set.name:f.n)}:</div>`;last=m.me}
const body=m.del?'<em style="opacity:.6">🚫 Bu mesaj silindi</em>':(m.r?`<div class="q">${esc(m.r)}</div>`:"")+(m.img?`<img src="${m.img}" class="pic">`:"")+(m.med?medHTML(m):"")+(m.file?fileHTML(m):"")+(m.loc?locHTML(m):"")+esc(m.t||"").replace(/\n/g,"<br>");
html+=`<div class="ml ${m.me?"mine":""}" onclick="menu(event,'${m.id}')"><span class="th">${m.me?myAv():avH(f)}</span><div class="bub"><span class="bl">•</span><span class="bt">${body}</span><i>${m.at}${m.del?"":tk(m)}</i></div></div>`;if(!m.me)lastRecv=m.at});
if(lastRecv)html+=`<div class="lr">Son alınan ileti zamanı: ${new Date().toLocaleDateString("tr-TR")} - ${lastRecv}.</div>`;
if(typing[f.pin])html+='<div class="tb"><i></i><i></i><i></i></div>';
$("msgs").innerHTML=html;$("msgs").scrollTop=1e9;renderList();updCbar()}
function pick(i){sel=i;st.friends[i].u=0;$("app").classList.add("open");applyBg();save();renderMsgs()}
$("back").onclick=()=>{$("app").classList.remove("open");applyBg()};
$("q").oninput=renderList;
const fm=id=>st.friends[sel].h.find(x=>x.id==id);
function menu(e,id){e.stopPropagation();const m=fm(id);if(!m||m.del)return;const mn=$("menu");mn.innerHTML=`<button onclick="setRep('${id}')">↩ Yanıtla</button><button onclick="cp('${id}')">⧉ Kopyala</button>`+(m.me?`<button onclick="dl('${id}')">🗑 Sil</button>`:"");mn.style.left=Math.min(e.clientX,innerWidth-150)+"px";mn.style.top=Math.min(e.clientY,innerHeight-130)+"px";mn.classList.add("show")}
document.addEventListener("click",()=>$("menu").classList.remove("show"));
function setRep(id){const m=fm(id);replyTo=m.med?medLabel(m):m.img&&!m.t?"📷 Fotoğraf":m.t;$("rep").innerHTML=`<span>↩ ${esc(replyTo)}</span><span style="cursor:pointer" onclick="clearRep()">✕</span>`;$("rep").classList.add("show");$("in").focus()}
function clearRep(){replyTo=null;$("rep").classList.remove("show")}
function cp(id){try{navigator.clipboard.writeText(fm(id).t||"")}catch(e){}}
function dl(id){const m=fm(id);m.del=true;m.img=null;m.med=null;delete vmem[id];RetroTransport.deleteForAll(st.friends[sel],id);save();renderMsgs()}
const replies=["Selam! 😊","Nasılsın?","Haha doğru 😂","Müzik harika bu arada 🎵","Sonra konuşuruz","Tamamdır 👍"];
function deliver(f,m,nudge){if(f.s=="off")return;setTimeout(()=>{m.st=1;save();renderMsgs()},500);setTimeout(()=>{typing[f.pin]=1;renderMsgs()},1100);setTimeout(()=>{typing[f.pin]=0;m.st=2;if(nudge){f.h.push({k:"n",me:0,id:uid()});shake()}else f.h.push(Math.random()<.3?{id:uid(),me:0,t:"",at:t(),med:{k:"img",mode:Math.random()<.5?"once":"timed",sec:5,src:genImg()}}:{id:uid(),me:0,t:replies[Math.random()*replies.length|0],at:t()});const viewing=st.friends[sel]===f&&($("app").classList.contains("open"));if(!viewing){f.u=(f.u||0)+1;notify(f,f.h[f.h.length-1])}save();renderMsgs()},2800);if(m.med&&m.med.mode!="normal")setTimeout(()=>{if(m.med&&!m.med.gone){m.med.gone=true;m.med.src=null;delete vmem[m.id];save();renderMsgs()}},7000)}
function send(img){const v=$("in").value.trim();if(!v&&!img)return;const f=st.friends[sel];const m={id:uid(),me:1,t:v,at:t(),st:0,img:img||null,r:replyTo};f.h.push(m);$("in").value="";grow();clearRep();save();renderMsgs();RetroTransport.sendMessage(f,m)}
$("send").onclick=()=>send();$("in").onkeydown=e=>{if(e.key=="Enter"&&!e.shiftKey){e.preventDefault();send()}};
$("nd").onclick=()=>{const f=st.friends[sel];f.h.push({k:"n",me:1,id:uid()});shake();save();renderMsgs();RetroTransport.sendNudge(f)};
const EC=[["🕒", ""], ["😀", "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵😵‍💫🤯🤠🥳😎🤓🧐😕😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽🤖😮‍💨😺😸😹😻😼😽🙀😿😾"], ["👋", "👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦵🦶👂👃🧠👀👁️👅👄👶🧒👦👧🧑👨👩🧓👴👵🙍🙎🙅🙆💁🙋🙇🤦🤷👮🕵️💂👷🤴👸👳👲🧕🤵👰🤰🤱👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟💆💇🚶🏃💃🕺👯"], ["❤️", "❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯☯️♈♉♊♋♌♍♎♏♐♑♒♓💯💢💥💫💦💨🕳️💣💬💭💤🔥✨⭐🌟⚡☄️🌈☀️🌙⭕❌✅❎❓❗‼️⁉️♻️🔴🟠🟡🟢🔵🟣⚫⚪🟤🔶🔷🔺🔻"], ["🐶", "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🦟🦗🕷️🦂🐢🐍🦎🦖🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦏🐪🐫🦒🐃🐂🐄🐎🐖🐏🐑🐐🦌🐕🐩🐈🐓🦃🦚🦜🦢🕊️🐇🦝🦨🦡🦦🐿️🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🍃🍂🍁🌾🌺🌻🌹🌷🌼🌸💐🍄"], ["🍔", "🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🧀🥚🍳🥞🥓🥩🍗🍖🌭🍔🍟🍕🥪🌮🌯🥗🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🍶🍺🍻🥂🍷🥃🍸🍹🍾🧊🥄🍴🍽️"], ["⚽", "⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🏑🥍🏏⛳🏹🎣🥊🥋🎽🛹⛸️🎿⛷️🏂🏋️🤼🤸⛹️🤺🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🎻🎲♟️🎯🎳🎮🎰🧩"], ["🚗", "🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🚚🚛🚜🛵🏍️🚲🛴🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓⛽🚧🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏢🏣🏥🏦🏨🏪🏫🏬🏭🌃🌆🌇🌉🌌🌠🎇🎆"], ["💡", "⌚📱📲💻⌨️🖥️🖨️🖱️💽💾💿📀📷📸📹🎥📞☎️📟📠📺📻🎙️🎚️🎛️⏱️⏲️⏰🕰️⌛⏳📡🔋🔌💡🔦🕯️💸💵💴💶💷💰💳💎⚖️🔧🔨⚒️🛠️⛏️🔩⚙️🔫🔪🗡️🛡️🔮📿🧿💈⚗️🔭🔬💊💉🌡️🧹🧺🧻🚽🚿🛁🔑🗝️🚪🛋️🛏️🖼️🛍️🎁🎈🎀🎉🎊✉️📧📦📪📮📝📁📂📅📆📈📉📊📌📍📎🖇️📏📐✂️🗑️🔒🔓🔍🔎"], ["🏁", "🏁🚩🎌🏴🏳️🏳️‍🌈🏴‍☠️🇹🇷🇦🇿🇩🇪🇬🇧🇺🇸🇫🇷🇮🇹🇪🇸🇯🇵🇰🇷🇨🇳🇷🇺🇧🇷🇨🇦🇦🇺🇦🇹🇳🇱🇬🇷🇸🇦🇦🇪🇪🇬"]];
const ER=/\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Modifier})*/gu;
(function(){let a="",t="";const ok=c=>/^\p{Emoji_Presentation}$/u.test(c)&&!/\p{Emoji_Modifier}/u.test(c);for(const [x,y] of [[0x231A,0x2B55],[0x1F000,0x1F1E5],[0x1F200,0x1FAFF]])for(let c=x;c<=y;c++){const h=String.fromCodePoint(c);if(ok(h))a+=h}
for(const [x,y] of [[0x261D,0x27BF],[0x1F300,0x1FAFF]])for(let c=x;c<=y;c++){const h=String.fromCodePoint(c);if(/^\p{Emoji_Modifier_Base}$/u.test(h))for(let k=0;k<5;k++)t+=h+String.fromCodePoint(0x1F3FB+k)}
EC.push(["🌐",a],["👍🏽",t])})();
let ecat=1;
function drawE(){$("etabs").innerHTML=EC.map((c,i)=>`<span class="et ${i==ecat?"on":""}" data-i="${i}">${c[0]}</span>`).join("");const list=ecat==0?(st.set.recent||[]):(EC[ecat][1].match(ER)||[]);$("egrid").innerHTML=list.length?list.map(x=>`<span>${x}</span>`).join(""):'<div style="opacity:.6;padding:10px;font-size:13px;grid-column:1/-1">Henüz son kullanılan yok</div>'}
$("em").onclick=e=>{e.stopPropagation();if($("emo").classList.toggle("show"))drawE()};
$("emo").onclick=e=>{const q2=e.target;if(q2.classList.contains("et")){ecat=+q2.dataset.i;drawE()}else if(q2.parentNode.id=="egrid"){const x=q2.textContent;$("in").value+=x;grow();st.set.recent=[x,...(st.set.recent||[]).filter(y=>y!=x)].slice(0,24);save();$("in").focus()}};

const medLabel=m=>{const d=m.med;return (d.mode=="once"?"👁 Tek seferlik ":d.mode=="timed"?"⏱ "+d.sec+" sn ":"")+(d.k=="img"?"📷 Fotoğraf":"🎞 Video")};
function medHTML(m){const d=m.med,ic=d.k=="img"?"📷":"🎞";if(d.mode=="normal"){const src=vmem[m.id]||d.src;return src?(d.k=="img"?`<img src="${src}" class="pic">`:`<video src="${src}" controls playsinline class="pic"></video>`):`<em style="opacity:.6">${ic} Medya artık mevcut değil</em>`}
const lab=medLabel(m);if(d.gone)return `<span class="mb gone">${m.me?"✓ Açıldı":"Açıldı · artık görüntülenemez"} · ${lab}</span>`;
return m.me?`<span class="mb" style="cursor:default">${lab} · gönderildi</span>`:`<button class="mb" onclick="openMed(event,'${m.id}')">${lab} — görmek için dokun</button>`}
let cur=null,tmo=0,tiv=0,pend=null;
function openMed(e,id){e.stopPropagation();const m=fm(id);if(!m||!m.med||m.med.gone)return;const d=m.med,src=vmem[id]||d.src;if(!src){d.gone=true;renderMsgs();return}cur=m;
$("mvb").innerHTML=d.k=="img"?`<img src="${src}" draggable="false">`:`<video src="${src}" autoplay playsinline></video>`;
$("mvl").textContent=d.mode=="once"?"👁 Tek seferlik · kapatınca silinir":"⏱ "+d.sec+" sn";
const bar=$("mvbar");bar.style.transition="none";bar.style.transform="scaleX(1)";bar.style.display=d.mode=="timed"?"block":"none";$("mv").style.display="flex";
if(d.mode=="timed"){void bar.offsetWidth;bar.style.transition=`transform ${d.sec}s linear`;bar.style.transform="scaleX(0)";let n=d.sec;$("mvl").textContent="⏱ "+n+" sn";tiv=setInterval(()=>{n--;$("mvl").textContent="⏱ "+Math.max(n,0)+" sn"},1000);tmo=setTimeout(closeMed,d.sec*1000)}}
function closeMed(){clearTimeout(tmo);clearInterval(tiv);$("mv").style.display="none";$("mvb").innerHTML="";const m=cur;cur=null;if(m&&m.med&&m.med.mode!="normal"){m.med.gone=true;m.med.src=null;delete vmem[m.id];save();renderMsgs()}}
$("mvx").onclick=closeMed;$("mv").oncontextmenu=e=>e.preventDefault();
document.addEventListener("visibilitychange",()=>{$("mvb").style.filter=document.hidden?"blur(30px)":"";if(!document.hidden){applyBg.k=null;applyBg()}});
function fromImg(fl,cb){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,800/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=im.width*k;c.height=im.height*k;c.getContext("2d").drawImage(im,0,0,c.width,c.height);cb(c.toDataURL("image/jpeg",.65))};im.src=r.result};r.readAsDataURL(fl)}
function genImg(){const c=document.createElement("canvas");c.width=480;c.height=320;const x=c.getContext("2d"),g=x.createLinearGradient(0,0,480,320),h=Math.random()*360|0;g.addColorStop(0,`hsl(${h},80%,55%)`);g.addColorStop(1,`hsl(${(h+80)%360},80%,40%)`);x.fillStyle=g;x.fillRect(0,0,480,320);x.font="130px serif";x.textAlign="center";x.textBaseline="middle";x.fillText(["🌅","🐱","🍕","🎸","🌊","🎉"][Math.random()*6|0],240,150);x.font="bold 26px sans-serif";x.fillStyle="#fff";x.fillText("RetroChat",240,285);return c.toDataURL("image/jpeg",.7)}
$("file").onchange=e=>{const fl=e.target.files[0];e.target.value="";if(!fl)return;const v=fl.type.startsWith("video/");if(v&&fl.size>30*1024*1024)return toast("Video en fazla 30 MB olabilir");pend={fl,v};const u=URL.createObjectURL(fl);$("mop").innerHTML=v?`<video src="${u}" controls playsinline style="max-width:100%;max-height:200px;border-radius:10px"></video>`:`<img src="${u}" style="max-width:100%;max-height:200px;border-radius:10px">`;document.querySelector('input[name=mm][value=normal]').checked=true;$("mo").style.display="flex"};
$("moX").onclick=()=>{$("mo").style.display="none";$("mop").innerHTML="";pend=null};
$("moOk").onclick=()=>{if(!pend)return;const mode=document.querySelector('input[name=mm]:checked').value,sec=+$("moS").value,{fl,v}=pend;pend=null;$("mo").style.display="none";$("mop").innerHTML="";const f=st.friends[sel];
const go=med=>{const m={id:uid(),me:1,t:"",at:t(),st:0,r:replyTo,med};if(v)vmem[m.id]=URL.createObjectURL(fl);f.h.push(m);clearRep();save();renderMsgs();RetroTransport.sendMessage(f,m)};
if(v)go({k:"vid",mode,sec,src:null});else fromImg(fl,d=>{if(mode=="normal")send(d);else go({k:"img",mode,sec,src:d})})};

$("hp").style.cursor="pointer";
function addFriend(n,p){n=(n||"").trim();p=(p||"").trim().toUpperCase();if(!/^[0-9A-F]{8}$/.test(p))return"PIN 8 haneli olmalı (0-9, A-F).";if(p==st.pin||st.friends.some(f=>f.pin==p))return"Bu PIN zaten ekli.";n=n||"Kişi "+p.slice(-4);st.friends.push({n,s:"on",e:["🧑","👧","👦","🧔","👩‍🎤","🦊"][Math.random()*6|0],pin:p,np:"",h:[],ls:""});save();renderList();return""}
function msg(t2,ok){$("aE").style.color=ok?"#00ff9d":"#ff6b8f";$("aE").textContent=t2}
const QR=RetroQR.initQR({$,getState:()=>st,addFriend,showToast:toast});
$("addb").onclick=()=>{QR.tab("P");$("add").style.display="flex"};
$("aX").onclick=()=>{QR.stopCam();$("add").style.display="none"};
$("add").onclick=e=>{if(e.target.id=="add"){QR.stopCam();$("add").style.display="none"}};
$("aOk").onclick=()=>{const e=addFriend("",$("aP").value);if(e)return msg(e,0);$("aP").value="";$("add").style.display="none"};

let pfi=0,pfMe=false;
function openPF(i){pfMe=false;$("pfVis").style.display="none";$("pfGo").style.display="";$("pfGal").style.display="";$("pfCam").style.display="";$("pfNp").style.display="none";$("pfSp").style.display="none";$("pfSpOff").style.display="none";pfi=i;const f=st.friends[i];$("pfa").innerHTML=avH(f)+`<span class="dot ${stc(f)}"></span>`;$("pfa").dataset.st=f.s;$("pfn").textContent=f.n;const ps=$("pfs");ps.textContent=({on:"● Online",busy:"● Meşgul",off:"● Offline"})[f.s]+(f.s=="off"?" · son görülme "+(f.ls||"yakınlarda"):"");ps.style.color=({on:"#00ff9d",busy:"#ff3d71",off:"#99a"})[f.s];$("pfm").textContent=f.np?"🎵 Şu an dinliyor: "+f.np:"";$("pfBio").value=f.bio!=null?f.bio:"Merhaba! RetroChat kullanıyorum.";$("pfp").textContent=f.pin;$("pf").style.display="flex"}
$("cav").onclick=()=>openPF(sel);$("mav").onclick=()=>openMyPF();$("myav").onclick=()=>openMyPF();$("mtS").onclick=()=>startCall("voice");$("mtG").onclick=()=>startCall("video");
function openMyPF(){pfMe=true;$("pfGal").style.display="none";$("pfCam").style.display="none";const c=st.set,m={on:"● Online",busy:"● Meşgul",off:"● Offline"},ps=$("pfs");$("pfa").innerHTML=myAv()+`<span class="dot ${c.status}"></span>`;$("pfa").dataset.st=c.status;$("pfn").textContent=c.name;ps.textContent=m[c.status]||"";ps.style.color=({on:"#00ff9d",busy:"#ff3d71",off:"#99a"})[c.status];$("pfm").textContent=c.mus&&c.song?"🎵 Şu an dinliyor: "+c.song:"";$("pfBio").value=c.stx||"Merhaba! RetroChat kullanıyorum.";$("pfp").textContent=st.pin;$("pfGo").style.display="none";$("pfNp").style.display="";myNpSync();visSync();$("pf").style.display="flex"}
$("pfX").onclick=()=>$("pf").style.display="none";$("pfXt").onclick=()=>$("pf").style.display="none";
$("pf").onclick=e=>{if(e.target.id=="pf")$("pf").style.display="none"};
$("pfGo").onclick=()=>{$("pf").style.display="none";pick(pfi)};
$("pfBio").onchange=()=>{if(pfMe){st.set.stx=$("pfBio").value;save();drawNp();smSync();return}st.friends[pfi].bio=$("pfBio").value;save()};
function sq(im){const W=im.videoWidth||im.width,H=im.videoHeight||im.height,z=Math.min(W,H),c=document.createElement("canvas");c.width=c.height=240;c.getContext("2d").drawImage(im,(W-z)/2,(H-z)/2,z,z,0,0,240,240);return c.toDataURL("image/jpeg",.7)}
function fromFile(fl,cb){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>cb(sq(im));im.src=r.result};r.readAsDataURL(fl)}
let photoCb=null,cstream=null;
function stopC(){if(cstream){cstream.getTracks().forEach(k=>k.stop());cstream=null}$("cam").style.display="none"}
function pickGallery(cb){photoCb=cb;$("galF").click()}
async function pickCamera(cb){photoCb=cb;try{cstream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}});const v=$("cv");v.srcObject=cstream;await v.play();$("cam").style.display="flex"}catch(e){stopC();$("capF").click()}}
$("galF").onchange=$("capF").onchange=e=>{const fl=e.target.files[0];if(fl&&photoCb)fromFile(fl,photoCb);e.target.value=""};
$("cShot").onclick=()=>{const d=sq($("cv"));stopC();if(photoCb)photoCb(d)};
$("cX").onclick=stopC;
const cbF=d=>{st.friends[pfi].photo=d;save();renderList();renderMsgs();openPF(pfi)};
const cbMe=d=>{st.set.photo=d;st.set.emo="";applySet();save();fill()};

$("sGal").onclick=()=>pickGallery(cbMe);$("sCam").onclick=()=>pickCamera(cbMe);
const AN=[["none","Yok"],["bounce","Zıpla"],["spin","Dön"],["wiggle","Salla"],["breathe","Nefes"],["float","Süzül"],["beat","Kalp atışı"],["flip","Çevril"]];
let pe={emo:"😀",anim:"bounce",cat:1};
function drawPE(){$("ptabs").innerHTML=EC.map((c,i)=>`<span class="et ${i==pe.cat?"on":""}" data-i="${i}">${c[0]}</span>`).join("");
const list=pe.cat==0?(st.set.recent||[]):(EC[pe.cat][1].match(ER)||[]);$("pgrid").innerHTML=list.map(x=>`<span>${x}</span>`).join("")||'<div style="opacity:.6;font-size:13px;grid-column:1/-1">Henüz son kullanılan yok</div>';
$("pan").innerHTML=AN.map(a=>`<button data-a="${a[0]}" style="padding:5px 10px;font-size:12px;${pe.anim==a[0]?"background:rgba(0,229,255,.3)":""}">${a[1]}</button>`).join("");
$("pprev").innerHTML=`<span class="ea${pe.anim!="none"?" an-"+pe.anim:""}">${pe.emo}</span>`}
$("sEmo").onclick=()=>{pe={emo:st.set.emo||"😀",anim:st.set.anim||"bounce",cat:1};drawPE();$("ep").style.display="flex"};
$("ptabs").onclick=e=>{if(e.target.dataset.i!=null){pe.cat=+e.target.dataset.i;drawPE()}};
$("pgrid").onclick=e=>{if(e.target.parentNode.id=="pgrid"){pe.emo=e.target.textContent;$("pprev").innerHTML=`<span class="ea${pe.anim!="none"?" an-"+pe.anim:""}">${pe.emo}</span>`}};
$("pan").onclick=e=>{if(e.target.dataset.a){pe.anim=e.target.dataset.a;drawPE()}};
$("pX").onclick=()=>$("ep").style.display="none";
$("pOk").onclick=()=>{st.set.photo=null;st.set.emo=pe.emo;st.set.anim=pe.anim;save();applySet();fill();renderMsgs();$("ep").style.display="none"};
let G=null,gto=0;
const GN={xox:"XOX",rps:"Taş Kağıt Makas",c4:"Dört Bağla"};
const L3=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const w3=b=>{for(const l of L3)if(b[l[0]]&&b[l[0]]==b[l[1]]&&b[l[0]]==b[l[2]])return l;return null};
function w4(b,p){for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){let ok=1;const cl=[];for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>5||cc<0||cc>6||b[rr*7+cc]!=p){ok=0;break}cl.push(rr*7+cc)}if(ok)return cl}return null}
const drop=(b,c,p)=>{for(let r=5;r>=0;r--)if(!b[r*7+c]){b[r*7+c]=p;return r*7+c}return -1};
const gdelay=(fn,ms)=>{clearTimeout(gto);gto=setTimeout(()=>{if(G)fn()},ms||750)};
function fin(who,cells,msgW,msgL){G.over=true;G.win=cells;if(who==0){G.sc[0]++;G.msg="🎉 Kazandın!"}else{G.sc[1]++;G.msg="😎 "+G.f.n+" kazandı"}}
function fin3(){const w=w3(G.b);if(w){fin(G.b[w[0]]=="X"?0:1,w);return true}if(G.b.every(v=>v)){G.over=true;G.sc[2]++;G.msg="🤝 Berabere";return true}return false}
function fin4(p){const w=w4(G.b,p);if(w){fin(p=="R"?0:1,w);return true}if(G.b.every(v=>v)){G.over=true;G.sc[2]++;G.msg="🤝 Berabere";return true}return false}
function aiX(){const b=G.b,e=b.map((v,i)=>v?-1:i).filter(i=>i>=0);const tw=p=>{for(const i of e){b[i]=p;const w=w3(b);b[i]="";if(w)return i}return -1};let m=Math.random()<.85?tw("O"):-1;if(m<0&&Math.random()<.85)m=tw("X");if(m<0&&!b[4]&&Math.random()<.8)m=4;if(m<0){const c=e.filter(i=>[0,2,6,8].includes(i));m=c.length&&Math.random()<.7?c[Math.random()*c.length|0]:e[Math.random()*e.length|0]}return m}
function aiC4(){const b=G.b,cols=[0,1,2,3,4,5,6].filter(c=>!b[c]);const t4=(c,p)=>{const i=drop(b,c,p);const w=i>=0&&w4(b,p);if(i>=0)b[i]="";return !!w};
for(const c of cols)if(t4(c,"Y"))return c;for(const c of cols)if(t4(c,"R")&&Math.random()<.9)return c;
const safe=cols.filter(c=>{const i=drop(b,c,"Y");const bad=t4(c,"R");if(i>=0)b[i]="";return !bad});const pool=safe.length?safe:cols;pool.sort((x,y)=>Math.abs(x-3)-Math.abs(y-3)+(Math.random()-.5)*2);return pool[0]}
function oppMove(){if(!G||G.over)return;if(G.k=="xox"){G.b[aiX()]="O";if(!fin3())G.turn="me"}else{drop(G.b,aiC4(),"Y");if(!fin4("Y"))G.turn="me"}gRender()}
function newRound(){G.r++;G.over=false;G.win=null;G.res=null;G.lock=false;if(G.k=="xox")G.b=Array(9).fill("");if(G.k=="c4")G.b=Array(42).fill("");G.turn=G.r%2?"me":"opp";gRender();if(G.k!="rps"&&G.turn=="opp")gdelay(oppMove)}
function gRender(){if(!G)return;const f=G.f;$("gt").textContent=GN[G.k];$("gsc").innerHTML=`${esc(st.set.name)} <b>${G.sc[0]}</b> – <b>${G.sc[1]}</b> ${esc(f.n)}`+(G.sc[2]?` · Berabere ${G.sc[2]}`:"");let h="";
if(G.k=="xox")h=`<div class="g3">${G.b.map((v,i)=>`<button class="gc ${v=="X"?"x":v=="O"?"o":""} ${G.win&&G.win.includes(i)?"w":""}" data-i="${i}">${v}</button>`).join("")}</div>`;
else if(G.k=="c4")h=`<div class="g7">${G.b.map((v,i)=>`<div class="c4 ${v} ${G.win&&G.win.includes(i)?"w":""}" data-c="${i%7}"></div>`).join("")}</div>`;
else h=`<div class="rv">${G.res?G.res.a+" vs "+G.res.b:"❔ vs ❔"}</div><div class="rp">${["✊","✋","✌️"].map((x,i)=>`<button data-p="${i}">${x}</button>`).join("")}</div>`;
$("gb").innerHTML=h;$("gs").textContent=G.k=="rps"?(G.res?G.res.txt:"Seçimini yap!"):G.over?G.msg:(G.turn=="me"?"Sıra sende":f.n+" düşünüyor…");$("gAgain").style.display=G.k!="rps"&&G.over?"":"none"}
$("gb").onclick=e=>{if(!G)return;const T=e.target;
if(G.k=="xox"){const i=T.dataset.i;if(i==null||G.over||G.turn!="me"||G.b[i])return;G.b[i]="X";if(!fin3()){G.turn="opp";gdelay(oppMove)}gRender()}
else if(G.k=="c4"){const c=T.closest("[data-c]");if(!c||G.over||G.turn!="me")return;if(drop(G.b,+c.dataset.c,"R")<0)return;if(!fin4("R")){G.turn="opp";gdelay(oppMove)}gRender()}
else{const p=T.dataset.p;if(p==null||G.lock)return;G.lock=true;const o=Math.random()*3|0,E=["✊","✋","✌️"],f=G.f;G.res={a:E[p],b:"❔",txt:f.n+" seçiyor…"};gRender();gdelay(()=>{const d=(p-o+3)%3;if(d==0){G.sc[2]++;G.res={a:E[p],b:E[o],txt:"🤝 Berabere"}}else if(d==1){G.sc[0]++;G.res={a:E[p],b:E[o],txt:"🎉 Kazandın!"}}else{G.sc[1]++;G.res={a:E[p],b:E[o],txt:"😎 "+f.n+" kazandı"}}G.lock=false;gRender()},800)}};
function startGame(k){$("gp").style.display="none";const f=st.friends[sel];f.h.push({k:"c",id:uid(),txt:"🎮 "+GN[k]+" oyununa davet ettin"});save();renderMsgs();toast(f.n+" daveti kabul ediyor…");setTimeout(()=>{if(f.s=="off")return toast(f.n+" offline oldu");G={k,f,sc:[0,0,0],r:0};f.h.push({k:"c",id:uid(),txt:"🎮 "+f.n+" daveti kabul etti"});save();renderMsgs();$("gm").style.display="flex";newRound()},1300)}
function closeGame(){clearTimeout(gto);if(G){const q=G.sc;if(q[0]+q[1]+q[2]>0){G.f.h.push({k:"c",id:uid(),txt:`🎮 ${GN[G.k]}: ${st.set.name} ${q[0]}–${q[1]} ${G.f.n}`});save()}}G=null;$("gm").style.display="none";renderMsgs()}
$("mtO").onclick=()=>{const f=st.friends[sel];if(f.s=="off")return toast(f.n+" offline, oyun oynanamaz");if(f.s=="busy")return toast(f.n+" meşgul");$("gp").style.display="flex"};
$("gpX").onclick=()=>$("gp").style.display="none";
$("gp").onclick=e=>{const b=e.target.closest("[data-g]");if(b)startGame(b.dataset.g)};
$("gAgain").onclick=()=>newRound();$("gX").onclick=closeGame;
const rnd=(a,b)=>a+Math.random()*(b-a);
const many=(n,fn)=>Array.from({length:n},(_,i)=>fn(i)).join("");
const wvImg=(c,g)=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">${g?`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>`:""}<path d="M0 60C150 100 350 10 600 60S1050 110 1200 60V120H0Z" fill="${g?"url(#g)":c}"/></svg>`)}")`;
const wave=(c,b,d,rev,g)=>`<div class="wv" style="background-image:${wvImg(c,g)};bottom:${b}%;animation-duration:${d}s;${rev?"animation-direction:reverse":""}"></div>`;
const BG={none:{n:"Yok"},
waves:{n:"🏖 Kumsal dalgaları",dk:0,h:()=>`<div class="bgf" style="background:linear-gradient(#cdeefa,#6cc7e3 38%,#2fa7c9 60%)"></div><div class="tide">${wave("rgba(255,255,255,.5)",36,17)}${wave("rgba(20,140,185,.6)",32,11,1)}</div><div class="sand"></div><div class="tide" style="animation-delay:-3s">${wave("rgba(255,255,255,.95)",27,8,0,1)}</div>`},
rain:{n:"🌧 Yağmur",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#18222d,#3a4d62)"></div>${many(70,()=>`<i class="rdp" style="left:${rnd(0,100)}%;height:${rnd(14,34)}px;animation-duration:${rnd(.6,1.2)}s;animation-delay:-${rnd(0,2)}s;opacity:${rnd(.3,.75)}"></i>`)}<div class="fl"></div>`},
night:{n:"🌌 Yıldızlı gece",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#040820,#1b2a6b 85%,#3b4a9a)"></div>${many(60,()=>{const z=rnd(1,3);return `<i class="st" style="left:${rnd(0,100)}%;top:${rnd(0,85)}%;width:${z}px;height:${z}px;animation-duration:${rnd(1.5,4)}s;animation-delay:-${rnd(0,3)}s"></i>`})}<i class="sh"></i><b class="mn">🌙</b>`},
snow:{n:"❄ Kar yağışı",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#17294a,#5b86b8)"></div>${many(45,()=>{const z=rnd(3,8);return `<i class="sn" style="left:${rnd(0,100)}%;width:${z}px;height:${z}px;animation-duration:${rnd(7,15)}s,${rnd(2,4)}s;animation-delay:-${rnd(0,12)}s;opacity:${rnd(.5,.95)}"></i>`})}`},
aurora:{n:"🌈 Aurora",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#02101a,#06283a)"></div><i class="au" style="left:-10%;top:5%;background:#27ffa0"></i><i class="au" style="left:30%;top:20%;background:#2a9dff;animation-delay:-5s"></i><i class="au" style="left:10%;top:35%;background:#a64bff;animation-delay:-9s"></i>${many(25,()=>`<i class="st" style="left:${rnd(0,100)}%;top:${rnd(0,60)}%;width:2px;height:2px;animation-duration:${rnd(2,4)}s"></i>`)}`},
sunset:{n:"🌅 Gün batımı",dk:0,h:()=>`<div class="bgf" style="background:linear-gradient(#ff8a5b,#ffc079 45%,#ffe9b8 62%)"></div><i class="sun"></i>${many(3,i=>`<i class="cl" style="top:${8+i*14}%;animation-duration:${38+i*14}s;animation-delay:-${i*11}s"></i>`)}<div style="left:0;right:0;bottom:0;height:38%;background:linear-gradient(#e8846a,#8a3e5c)"></div><div class="tide">${wave("rgba(255,200,140,.55)",34,15)}${wave("rgba(255,120,100,.5)",30,10,1)}</div>`},
ocean:{n:"🫧 Okyanus",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#0a8fb0,#06425a 70%,#032a3c)"></div><i class="ray" style="left:12%"></i><i class="ray" style="left:42%;animation-delay:-2s"></i><i class="ray" style="left:70%;animation-delay:-4s"></i>${many(30,()=>{const z=rnd(6,22);return `<i class="bb" style="left:${rnd(0,100)}%;width:${z}px;height:${z}px;animation-duration:${rnd(7,15)}s,${rnd(2,4)}s;animation-delay:-${rnd(0,12)}s"></i>`})}`},
synth:{n:"🕹 Synthwave",dk:1,h:()=>`<div class="bgf" style="background:linear-gradient(#14002e,#5b0a6e 55%,#ff2a6d)"></div><i class="ss"></i><div class="gr"><div class="gi"></div></div>`}};

function applyBg(){const c=st.set,k=c.bg==null?"ocean":(BG[c.bg]?c.bg:"none"),L=$("bgl"),ch=$("chat");if(applyBg.k!==k||(k!="none"&&!L.firstChild)){L.innerHTML=k=="none"?"":BG[k].h();applyBg.k=k}ch.classList.toggle("bgon",k!="none");document.body.classList.toggle("bgon",k!="none");ch.classList.add("dk");L.classList.toggle("pause",c.bgAnim===false||!$("app").classList.contains("open"))}
function drawBp(){const c=st.set;$("bpl").innerHTML=Object.entries(BG).map(([k,v])=>`<button data-k="${k}" class="bpc ${(c.bg==null?"ocean":c.bg)==k?"on":""}">${v.n}</button>`).join("");$("bpA").checked=c.bgAnim!==false}
$("mtB").onclick=()=>{drawBp();$("bp").style.display="flex"};
$("bpl").onclick=e=>{const k=e.target.dataset.k;if(!k)return;st.set.bg=k;save();applySet();drawBp()};
$("bpA").onchange=()=>{st.set.bgAnim=$("bpA").checked;save();applySet()};
$("bpX").onclick=()=>$("bp").style.display="none";
$("bp").onclick=e=>{if(e.target.id=="bp")$("bp").style.display="none"};
const GIP={"send": ["#00F2FE", "#4FACFE"], "voice": ["#9B51E0", "#E056FD"], "nudge": ["#FF9900", "#FF5E36"], "settings": ["#00C6FF", "#0072FF"], "add": ["#F355DA", "#6E0DD0"]};
const GIDEFS="<defs><linearGradient id=\"ID-s\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"C0\"/><stop offset=\"1\" stop-color=\"C1\"/></linearGradient>\n<linearGradient id=\"ID-f\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"C0\" stop-opacity=\".55\"/><stop offset=\"1\" stop-color=\"C1\" stop-opacity=\".14\"/></linearGradient>\n<linearGradient id=\"ID-f2\" x1=\"1\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"C0\" stop-opacity=\".8\"/><stop offset=\"1\" stop-color=\"C1\" stop-opacity=\".28\"/></linearGradient>\n<linearGradient id=\"ID-h\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".9\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient>\n<linearGradient id=\"ID-t\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"C0\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"C1\" stop-opacity=\".95\"/></linearGradient>\n<radialGradient id=\"ID-r\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\".35\" stop-color=\"C0\"/><stop offset=\"1\" stop-color=\"C1\" stop-opacity=\"0\"/></radialGradient></defs>";
const GIART={"send": "<g stroke-linejoin=\"round\" stroke-linecap=\"round\">\n<path d=\"M1 39C7 40 12 39 17 36\" fill=\"none\" stroke=\"url(#ID-t)\" stroke-width=\"1.3\"/>\n<path d=\"M3 47C13 49 20 47 27 41\" fill=\"none\" stroke=\"url(#ID-t)\" stroke-width=\"1.7\"/>\n<path d=\"M7 55C17 57 26 55 33 49\" fill=\"none\" stroke=\"url(#ID-t)\" stroke-width=\"1.3\" stroke-opacity=\".7\"/>\n<path d=\"M56 10L10 29L27 37Z\" fill=\"url(#ID-f)\" stroke=\"url(#ID-s)\" stroke-width=\"1.6\"/>\n<path d=\"M56 10L27 37L35 54Z\" fill=\"url(#ID-f2)\" stroke=\"url(#ID-s)\" stroke-width=\"1.6\"/>\n<path d=\"M27 37L35 54L27 46Z\" fill=\"url(#ID-f)\" stroke=\"url(#ID-s)\" stroke-width=\"1.4\"/>\n<path d=\"M56 10L10 29L27 37Z\" fill=\"url(#ID-h)\" fill-opacity=\".4\"/>\n<path d=\"M56 10L27 37\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".85\" stroke-width=\"1\"/></g>", "voice": "<circle cx=\"32\" cy=\"32\" r=\"22\" fill=\"url(#ID-f)\" fill-opacity=\".4\" stroke=\"url(#ID-s)\" stroke-width=\"1.8\" stroke-opacity=\".8\"/>\n<g fill=\"none\" stroke-linecap=\"round\"><path d=\"M4 32C9 32 10 18 16 18S22 46 28 46 34 14 40 14 46 42 52 42 56 32 60 32\" stroke=\"url(#ID-s)\" stroke-width=\"9\" stroke-opacity=\".22\"/><path d=\"M4 32C9 32 10 18 16 18S22 46 28 46 34 14 40 14 46 42 52 42 56 32 60 32\" stroke=\"url(#ID-s)\" stroke-width=\"4.5\"/><path d=\"M4 32C9 32 10 18 16 18S22 46 28 46 34 14 40 14 46 42 52 42 56 32 60 32\" transform=\"translate(0 -1.4)\" stroke=\"#fff\" stroke-opacity=\".85\" stroke-width=\"1.2\"/>\n<path d=\"M32 10A22 22 0 0 0 32 54\" stroke=\"url(#ID-s)\" stroke-width=\"2.6\"/><path d=\"M31 11.5A20.5 20.5 0 0 0 31 52.5\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\".8\"/></g>", "nudge": "<g fill=\"none\" stroke-linecap=\"round\"><circle cx=\"32\" cy=\"32\" r=\"26.5\" stroke=\"url(#ID-s)\" stroke-width=\"1.4\" stroke-opacity=\".5\" stroke-dasharray=\"2 8\">@@ANIM(26,-1)@@</circle>\n<circle cx=\"32\" cy=\"32\" r=\"20\" stroke=\"url(#ID-s)\" stroke-width=\"1.8\" stroke-opacity=\".75\" stroke-dasharray=\"7 5\">@@ANIM(18,1)@@</circle>\n<circle cx=\"32\" cy=\"32\" r=\"13.5\" stroke=\"url(#ID-s)\" stroke-width=\"2.2\" stroke-dasharray=\"4 4\">@@ANIM(10,-1)@@</circle></g>\n<circle cx=\"32\" cy=\"32\" r=\"9.5\" fill=\"url(#ID-r)\"/><circle cx=\"32\" cy=\"32\" r=\"4\" fill=\"#fff\" fill-opacity=\".95\"/><circle cx=\"53.6\" cy=\"39.9\" r=\"1.6\" fill=\"#fff\" fill-opacity=\"0.9\"/><circle cx=\"39.5\" cy=\"60\" r=\"1.2\" fill=\"#fff\" fill-opacity=\"0.7\"/><circle cx=\"16.6\" cy=\"50.4\" r=\"1.8\" fill=\"#fff\" fill-opacity=\"0.9\"/><circle cx=\"4.4\" cy=\"27.1\" r=\"1.3\" fill=\"#fff\" fill-opacity=\"0.7\"/><circle cx=\"22.7\" cy=\"12.1\" r=\"1.6\" fill=\"#fff\" fill-opacity=\"0.9\"/><circle cx=\"46.5\" cy=\"6.9\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.7\"/><circle cx=\"48\" cy=\"26.2\" r=\"1.1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"29.2\" cy=\"47.8\" r=\"1.2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"18.9\" cy=\"22.8\" r=\"1.3\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"3.8\" cy=\"42.3\" r=\"0.9\" fill=\"#fff\" fill-opacity=\"0.6\"/>", "settings": "<g>@@ANIM(40,1)@@<path d=\"M53.4 26.9 L58.8 28.4 L58.8 35.6 L53.4 37.1 L50.8 43.5 L53.5 48.4 L48.4 53.5 L43.5 50.8 L37.1 53.4 L35.6 58.8 L28.4 58.8 L26.9 53.4 L20.5 50.8 L15.6 53.5 L10.5 48.4 L13.2 43.5 L10.6 37.1 L5.2 35.6 L5.2 28.4 L10.6 26.9 L13.2 20.5 L10.5 15.6 L15.6 10.5 L20.5 13.2 L26.9 10.6 L28.4 5.2 L35.6 5.2 L37.1 10.6 L43.5 13.2 L48.4 10.5 L53.5 15.6 L50.8 20.5Z M47.5 32A15.5 15.5 0 1 0 16.5 32A15.5 15.5 0 1 0 47.5 32Z\" fill-rule=\"evenodd\" fill=\"url(#ID-f)\" fill-opacity=\".6\" stroke=\"url(#ID-s)\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/>\n<circle cx=\"32\" cy=\"32\" r=\"18.6\" fill=\"none\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\" stroke-dasharray=\"22 5 3 5\" stroke-opacity=\".8\"/><path d=\"M47.8 38.4L51.5 39.9\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"52\" cy=\"40.1\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M38.6 47.6L40.2 51.3\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"40.4\" cy=\"51.9\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M25.6 47.8L24.1 51.5\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"23.9\" cy=\"52\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M16.4 38.6L12.7 40.2\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"12.1\" cy=\"40.4\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M16.2 25.6L12.5 24.1\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"12\" cy=\"23.9\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M25.4 16.4L23.8 12.7\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"23.6\" cy=\"12.1\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M38.4 16.2L39.9 12.5\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"40.1\" cy=\"12\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/><path d=\"M47.6 25.4L51.3 23.8\" stroke=\"url(#ID-s)\" stroke-width=\"1.1\"/><circle cx=\"51.9\" cy=\"23.6\" r=\"1\" fill=\"#fff\" fill-opacity=\".85\"/></g>\n<g>@@ANIM(20,-1)@@<path d=\"M41 31.5 L44 33 L42.9 37.1 L39.5 36.9 L36.9 39.5 L37.1 42.9 L33 44 L31.5 41 L27.9 40 L25.2 41.9 L22.1 38.8 L24 36.1 L23 32.5 L20 31 L21.1 26.9 L24.5 27.1 L27.1 24.5 L26.9 21.1 L31 20 L32.5 23 L36.1 24 L38.8 22.1 L41.9 25.2 L40 27.9Z M36 32A4 4 0 1 0 28 32A4 4 0 1 0 36 32Z\" fill-rule=\"evenodd\" fill=\"url(#ID-f)\" stroke=\"url(#ID-s)\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/>\n<circle cx=\"32\" cy=\"32\" r=\"14\" fill=\"none\" stroke=\"url(#ID-s)\" stroke-width=\".8\" stroke-dasharray=\"1.5 3\" stroke-opacity=\".8\"/></g><circle cx=\"32\" cy=\"32\" r=\"1.5\" fill=\"#fff\"/>", "add": "<g stroke-linejoin=\"round\" stroke-linecap=\"round\"><path d=\"M7 56C7 43 15 37 26 37S45 43 45 56Z\" fill=\"url(#ID-f2)\" stroke=\"url(#ID-s)\" stroke-width=\"1.6\"/>\n<circle cx=\"26\" cy=\"24\" r=\"9.5\" fill=\"url(#ID-f)\" stroke=\"url(#ID-s)\" stroke-width=\"1.6\"/>\n<g fill=\"none\" stroke=\"#fff\" stroke-opacity=\".55\" stroke-width=\".7\"><path d=\"M26 14.5L20 22L26 25L32 22Z M20 22L19 28L26 33.5L26 25 M32 22L33 28L26 33.5 M19 28L26 33.5L33 28\"/>\n<path d=\"M14 44L22 40L26 48Z M22 40L30 40L26 48Z M30 40L38 44L26 48Z M14 44L18 52L26 48 M38 44L34 52L26 48 M18 52L34 52L26 48 M22 40L26 37 M30 40L26 37\"/></g>\n<g fill=\"#fff\" fill-opacity=\".9\"><circle cx=\"26\" cy=\"14.5\" r=\"1\"/><circle cx=\"20\" cy=\"22\" r=\"1\"/><circle cx=\"32\" cy=\"22\" r=\"1\"/><circle cx=\"26\" cy=\"25\" r=\"1\"/><circle cx=\"26\" cy=\"33.5\" r=\"1\"/><circle cx=\"14\" cy=\"44\" r=\"1\"/><circle cx=\"22\" cy=\"40\" r=\"1\"/><circle cx=\"30\" cy=\"40\" r=\"1\"/><circle cx=\"38\" cy=\"44\" r=\"1\"/><circle cx=\"26\" cy=\"48\" r=\"1\"/><circle cx=\"18\" cy=\"52\" r=\"1\"/><circle cx=\"34\" cy=\"52\" r=\"1\"/></g>\n<path d=\"M50 6V22M42 14H58\" fill=\"none\" stroke=\"url(#ID-s)\" stroke-width=\"7.5\" stroke-opacity=\".35\"/><path d=\"M50 6V22M42 14H58\" fill=\"none\" stroke=\"url(#ID-s)\" stroke-width=\"4.4\"/><path d=\"M50 6V22M42 14H58\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.4\" stroke-opacity=\".9\"/></g>"};
let gin=0;
function gi(t,s,an){const [a,b]=GIP[t],id="gi"+(++gin);let h=GIDEFS+GIART[t];h=h.split("ID-").join(id+"-").split('"C0"').join('"'+a+'"').split('"C1"').join('"'+b+'"').replace(/@@ANIM\((\d+),(-?\d)\)@@/g,(m,d,dr)=>an?`<animateTransform attributeName="transform" type="rotate" from="${dr>0?"0":"360"} 32 32" to="${dr>0?"360":"0"} 32 32" dur="${d}s" repeatCount="indefinite"/>`:"");return `<span class="gic" style="--s:${s}px;--c0:${a};--c1:${b};--g0:${a}2e;--g1:${b}73;--g2:${b}66"><svg viewBox="0 0 64 64">${h}</svg></span>`}
$("gear").innerHTML=gi("settings",36);
$("addb").innerHTML='<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.8" fill="currentColor"/><path d="M2 20.5c0-3.8 3.1-6.3 7-6.3s7 2.5 7 6.3z" fill="currentColor"/><path d="M19 5.5v7M15.5 9h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
$("nd").innerHTML="🫨";$("nd").className="gib";
$("send").innerHTML='<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="19" fill="var(--t160,#bcc0f5)"/><path d="M10 21l20-9-7 17-3-7z" fill="var(--t161,#3f56d6)"/></svg>';$("send").className="gib";
$("mtS").innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--t83,#4a55c8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';$("mtS").title="Sesli görüşme";$("mtS").setAttribute("aria-label","Sesli görüşme");
const fsz=n=>n<1024?n+" B":n<1048576?(n/1024).toFixed(0)+" KB":(n/1048576).toFixed(1)+" MB";
function fileHTML(m){const d=m.file,u=vmem[m.id],y=d.type||"",ic=/image/.test(y)?"🖼️":/pdf/.test(y)?"📕":/audio/.test(y)?"🎵":/video/.test(y)?"🎞️":/zip|rar|7z|compressed/.test(y)?"🗜️":"📄";return `<span class="fc"><span class="fi2">${ic}</span><span class="fn"><b>${esc(d.name)}</b><small>${fsz(d.size)}${u?"":" · artık mevcut değil"}</small></span>${u?`<a href="${u}" download="${esc(d.name)}" onclick="event.stopPropagation()">⬇</a>`:""}</span>`}
function locHTML(m){const d=m.loc;return `<a class="lc" href="https://www.google.com/maps?q=${d.lat},${d.lon}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><svg viewBox="0 0 120 70" width="96" height="56"><rect width="120" height="70" rx="8" fill="rgba(255,255,255,.1)"/><path d="M0 22H120M0 46H120M30 0V70M60 0V70M90 0V70" stroke="rgba(255,255,255,.2)" stroke-width="1"/><path d="M60 12a12 12 0 0 1 12 12c0 10-12 24-12 24S48 34 48 24a12 12 0 0 1 12-12z" fill="#3ddc84" stroke="#fff" stroke-width="1.5"/><circle cx="60" cy="24" r="4.5" fill="#fff"/></svg><span>📍 Konum<small>${d.lat}, ${d.lon}${d.acc?" · ±"+d.acc+" m":""}</small></span></a>`}
$("at").onclick=e=>{e.stopPropagation();$("ap").classList.toggle("show")};
document.addEventListener("click",e=>{if(!e.target.closest("#ap"))$("ap").classList.remove("show")});
$("ap").onclick=e=>{const b=e.target.closest("[data-a]");if(!b)return;$("ap").classList.remove("show");const a=b.dataset.a;if(a=="gal")$("file").click();else if(a=="doc")$("docF").click();else sendLoc()};
$("docF").onchange=e=>{const fl=e.target.files[0];e.target.value="";if(!fl)return;if(fl.size>50*1024*1024)return toast("Dosya en fazla 50 MB olabilir");const f=st.friends[sel],m={id:uid(),me:1,t:"",at:t(),st:0,r:replyTo,file:{name:fl.name,size:fl.size,type:fl.type}};vmem[m.id]=URL.createObjectURL(fl);f.h.push(m);clearRep();save();renderMsgs();RetroTransport.sendMessage(f,m)};
function sendLoc(){if(!navigator.geolocation)return toast("Bu cihazda konum desteği yok");toast("Konum alınıyor…");navigator.geolocation.getCurrentPosition(pos=>{const f=st.friends[sel],m={id:uid(),me:1,t:"",at:t(),st:0,r:replyTo,loc:{lat:+pos.coords.latitude.toFixed(5),lon:+pos.coords.longitude.toFixed(5),acc:Math.round(pos.coords.accuracy)}};f.h.push(m);clearRep();save();renderMsgs();RetroTransport.sendMessage(f,m)},()=>toast("Konum alınamadı. Konum izni verdiğinden emin ol"),{enableHighAccuracy:true,timeout:10000})}
let nbT=0,nbF=null;
function notify(f,m){if(!m)return;RetroHaptics.notify(st.set.vib);const x=m.k=="n"?"😵‍💫 Titreşim gönderdi":m.med?medLabel(m):m.img?"📷 Fotoğraf":m.file?"📄 "+m.file.name:m.loc?"📍 Konum":m.t;nbF=f;$("nba").innerHTML=avH(f);$("nbn").textContent=f.n;$("nbt").textContent=x;const b=$("nb");b.classList.add("show");clearTimeout(nbT);nbT=setTimeout(()=>b.classList.remove("show"),4000)}
let nbMoved=false;
$("nb").onclick=()=>{if(nbMoved){nbMoved=false;return}$("nb").classList.remove("show");const i=st.friends.indexOf(nbF);if(i>=0)pick(i)};
const autoMsgs=["Naber? 😊","Akşam boş musun?","Şu şarkıyı dinledin mi? 🎵","Toplantı kaçtaydı?","Günaydın! ☀️","Bir şey soracaktım","😂😂😂","Dosyayı gönderdim mi?","Müsait olunca ara 👋"];
let autoT=0;
function fireAuto(){const open=$("app").classList.contains("open");const c=st.friends.filter(f=>f.s!="off"&&!(open&&st.friends[sel]===f));if(!c.length)return false;const f=c[Math.random()*c.length|0],m={id:uid(),me:0,t:autoMsgs[Math.random()*autoMsgs.length|0],at:t()};f.h.push(m);f.u=(f.u||0)+1;save();renderMsgs();notify(f,m);return true}
function autoLoop(first){clearTimeout(autoT);if(st.set.auto===false)return;autoT=setTimeout(()=>{fireAuto();autoLoop()},first||rnd(9000,16000))}
$("sAuto").onchange=()=>{readSet();autoLoop(6000)};
$("sFire").onclick=()=>{if(!fireAuto())toast("Mesaj gönderebilecek başka online kişi yok")};
autoLoop(7000);
(function(){const b=$("nb");let y0=null,dy=0;
b.addEventListener("pointerdown",e=>{y0=e.clientY;dy=0;nbMoved=false;b.style.transition="none";clearTimeout(nbT);try{b.setPointerCapture(e.pointerId)}catch(_){}});
b.addEventListener("pointermove",e=>{if(y0==null)return;const d=e.clientY-y0;dy=Math.min(0,d);if(Math.abs(d)>6)nbMoved=true;b.style.transform=`translate(-50%,${dy}px)`;b.style.opacity=Math.max(.25,1+dy/140)});
const end=()=>{if(y0==null)return;const d=dy;y0=null;b.style.transition="";b.style.transform="";b.style.opacity="";if(d<-28){b.classList.remove("show")}else{clearTimeout(nbT);nbT=setTimeout(()=>b.classList.remove("show"),2500)}};
b.addEventListener("pointerup",end);b.addEventListener("pointercancel",end)})();
function grow(){const t2=$("in");t2.style.height="auto";t2.style.height=Math.min(t2.scrollHeight,112)+"px"}
$("in").addEventListener("input",grow);grow();
function drawNp(){const c=st.set,m=!!(c.mus&&c.song);$("np").value=m?c.song:(c.stx||"");$("np").placeholder=m?"Şarkı - sanatçı":"Durumunu yaz…";$("npi").innerHTML=m?'<span class="eq"><i></i><i></i><i></i></span>':'<svg viewBox="0 0 24 24"><path d="M12 4c5 0 9 3 9 7s-4 7-9 7c-1 0-2-.1-3-.4L5 20l1-3.4C4.2 15.3 3 13.3 3 11c0-4 4-7 9-7z" fill="var(--t162,#e8e9ff)"/></svg>';$("npm").classList.toggle("on",m)}
$("np").onchange=()=>{const v=$("np").value.trim(),c=st.set;if(c.mus){c.song=v;if(!v)c.mus=false}else c.stx=v;save();drawNp()};
$("np").onkeydown=e=>{if(e.key=="Enter")$("np").blur()};
/* ===== Spotify: anlık "ne dinliyorum" ===== */
const SPCB="retrochat://spotify-callback";
const SPCap=()=>window.Capacitor&&Capacitor.Plugins||null;
const SPN=()=>!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())||!!window.ReactNativeWebView;
const SPU=()=>SPN()?SPCB:location.origin+location.pathname;
function spOpen(url){const B=SPCap()&&SPCap().Browser;if(B){B.open({url});return}if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"spotify-auth",url}));return}location.href=url}
let spT=null;
async function spToken(body){const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(Object.assign({client_id:st.set.spId},body))});if(!r.ok)throw new Error("tok");const j=await r.json(),o=st.set.sp||{};st.set.sp={at:j.access_token,rt:j.refresh_token||o.rt,exp:Date.now()+(j.expires_in-60)*1000};save();return st.set.sp}
async function spAuth(){const id=$("pfSpId").value.trim();if(!id)return toast("Client ID gerekli");if(!SPN()&&!/^https?:$/.test(location.protocol))return toast("Spotify için uygulamayı https adresinden ya da uygulama olarak aç");if(!SPN()&&(location.origin==="null"||window.top!==window.self))return toast("Spotify bağlantısı playground içinde çalışmaz, uygulamayı kendi https adresinde aç");const cs="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~",v=Array.from(crypto.getRandomValues(new Uint8Array(64)),x=>cs[x%cs.length]).join(""),h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)),ch=btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");st.set.spId=id;save();try{localStorage.setItem("spv",v)}catch(e){}spOpen("https://accounts.spotify.com/authorize?"+new URLSearchParams({response_type:"code",client_id:id,scope:"user-read-currently-playing",redirect_uri:SPU(),code_challenge_method:"S256",code_challenge:ch}))}
async function spHandle(u){let q;try{q=new URL(u).searchParams}catch(e){return}const code=q.get("code");if(!code&&!q.get("error"))return;const B=SPCap()&&SPCap().Browser;if(B&&B.close){try{B.close()}catch(e){}}if(!SPN()){try{history.replaceState(null,"",SPU())}catch(e){}}if(!code)return toast("Spotify bağlantısı iptal edildi");try{await spToken({grant_type:"authorization_code",code,redirect_uri:SPU(),code_verifier:localStorage.getItem("spv")||""});st.set.mus=true;save();drawNp();spStart();myNpSync();toast("Spotify bağlandı")}catch(e){toast("Spotify bağlantısı başarısız")}}
window.spotifyCallback=spHandle;
if(SPCap()&&SPCap().App)SPCap().App.addListener("appUrlOpen",e=>spHandle(e.url));
document.addEventListener("visibilitychange",()=>{if(document.hidden){clearInterval(spT);spT=null}else spStart()});
async function spPoll(){const c=st.set;if(!c.mus||!c.sp)return;try{let t=c.sp;if(Date.now()>t.exp)t=await spToken({grant_type:"refresh_token",refresh_token:t.rt});const get=()=>fetch("https://api.spotify.com/v1/me/player/currently-playing",{headers:{Authorization:"Bearer "+t.at}});let r=await get();if(r.status==401){t=await spToken({grant_type:"refresh_token",refresh_token:t.rt});r=await get()}if(r.status==429||r.status>=500)return;let song="";if(r.status==200){const j=await r.json();if(j&&j.is_playing&&j.item&&j.currently_playing_type=="track")song=j.item.artists.map(a=>a.name).join(", ")+" - "+j.item.name}if(song!==c.song){c.song=song;save();drawNp();myNpSync()}}catch(e){}}
function spStart(){clearInterval(spT);spT=null;if(st.set.mus&&st.set.sp){spPoll();spT=setInterval(spPoll,5000)}}
function phSheet(){let o=$("shs");if(o)o.remove();o=document.createElement("div");o.id="shs";o.innerHTML='<div class="pn"><div class="gr"></div><b>Profil fotoğrafı</b><div class="ap" style="grid-template-columns:repeat(3,1fr)"></div><button class="cn">İptal</button></div>';
 const g=(c1,c2,d)=>'<svg viewBox="0 0 52 52" width="52" height="52"><defs><linearGradient id="phg'+c1.slice(1)+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c1+'"/><stop offset="1" stop-color="'+c2+'"/></linearGradient></defs><rect width="52" height="52" rx="12" fill="url(#phg'+c1.slice(1)+')"/>'+d+'</svg>';
 const st='fill="none" stroke="#fff" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"';
 const A=[["Galeri",g("#c47bff","#8f45ee",'<rect x="12" y="14" width="28" height="24" rx="4" '+st+'/><circle cx="20" cy="22" r="2.500" fill="#fff"/><path d="M13 35l9-8 7 6 4-3 7 6" '+st+'/>'),"sGal"],["Kamera",g("#6fc3ff","#2a7bf5",'<path d="M12 21a3 3 0 0 1 3-3h2.500l2-3h9l2 3H37a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" '+st+'/><circle cx="26" cy="27.500" r="5" '+st+'/>'),"sCam"],["Emoji",g("#ffd45a","#ff9a1f",'<circle cx="26" cy="26" r="13" '+st+'/><circle cx="21.500" cy="23" r="1.800" fill="#fff"/><circle cx="30.500" cy="23" r="1.800" fill="#fff"/><path d="M20 29.500c2 3.200 10 3.200 12 0" '+st+'/>'),"sEmo"]];
 A.forEach(a=>{const b=document.createElement("button");b.innerHTML='<i>'+a[1]+'</i><span>'+a[0]+'</span>';b.onclick=()=>{o.remove();$(a[2]).click()};o.querySelector(".ap").appendChild(b)});
 o.querySelector(".cn").onclick=()=>o.remove();o.onclick=ev=>{if(ev.target===o)o.remove()};document.body.appendChild(o)}
$("wpCam").onclick=phSheet;$("sPh").onclick=phSheet;$("sPh").style.cursor="pointer";
document.querySelectorAll("#spg-prof .wp").forEach(r=>r.onclick=()=>{const i=r.querySelector("input[type=text]");if(i)i.focus()});
function smSync(){const c=st.set,v=$("sStatus").value||c.status;$("smAv").innerHTML=myAv();$("smAv").dataset.st=v;$("smName").textContent=$("sName").value||c.name;$("smSub").textContent=(c.stx&&c.stx.trim())?c.stx:"Merhaba! RetroChat kullanıyorum."}
let liveT=null;const live=()=>{clearTimeout(liveT);liveT=setTimeout(()=>{readSet();smSync()},350)};
$("set").addEventListener("input",live);$("set").addEventListener("change",live);
window.androidBack=function(){
 const sh=$("shs");if(sh){sh.remove();return true}
 if($("cam")&&$("cam").style.display=="flex"){$("cX").click();return true}
 if($("pf").style.display=="flex"){$("pf").style.display="none";return true}
 if($("qrm")&&$("qrm").style.display=="flex"){QR.closeQR();return true}
 if($("add").style.display=="flex"){QR.stopCam();$("add").style.display="none";return true}
 if($("set").classList.contains("show")){if($("sSubHd").style.display=="flex")$("sBack").click();else $("sClose").click();return true}
 if($("app").classList.contains("open")){$("back").click();return true}
 return false};
$("sStx").addEventListener("input",()=>{st.set.stx=$("sStx").value;save();drawNp();smSync()});
const VIS_TXT={all:"Yazdıkların herkes tarafından görülebilir.",contacts:"Yazdıkların sadece kişilerin tarafından görülebilir.",none:"Yazdıklarını hiç kimse göremez."};
const VIS_PF={all:"👁 Herkes görebilir",contacts:"👁 Sadece kişilerin görebilir",none:"👁 Hiç kimse göremez"};
function visSync(){const v=st.set.stxVis||"all";document.querySelectorAll("#sVis button").forEach(b=>b.classList.toggle("on",b.dataset.v==v));$("sStxN").textContent=VIS_TXT[v];if(pfMe){$("pfVis").style.display="";$("pfVis").textContent=VIS_PF[v]}}
document.querySelectorAll("#sVis button").forEach(b=>b.onclick=()=>{st.set.stxVis=b.dataset.v;save();visSync()});
const RINGS={
 klasik:{n:"Klasik",w:"sine",p:1.6,s:[[440,0,.38],[480,0,.38],[440,.5,.38],[480,.5,.38]]},
 retro:{n:"Retro",w:"square",p:1.4,s:[[523,0,.1],[659,.12,.1],[784,.24,.1],[1047,.36,.22]]},
 kristal:{n:"Kristal",w:"sine",p:1.7,s:[[1319,0,.3],[1568,.16,.3],[2093,.32,.5]]},
 dijital:{n:"Dijital",w:"square",p:1.3,s:[[1000,0,.08],[1000,.14,.08],[1000,.28,.08],[1500,.5,.2]]},
 yumusak:{n:"Yumuşak",w:"triangle",p:1.8,s:[[392,0,.35],[523,.3,.35],[659,.6,.6]]},
 sessiz:{n:"Sessiz",w:"sine",p:1,s:[]}};
let ringN=[];
function ringStop(){ringN.forEach(o=>{try{o.stop()}catch(e){}});ringN=[]}
function ringPlay(k,loops){ringStop();const r=RINGS[k];if(!r||!r.s.length)return;try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();if(ac.state=="suspended")ac.resume();const v=.25*(st.set.vol||60)/100,t0=ac.currentTime;for(let l=0;l<loops;l++)r.s.forEach(x=>{const o=ac.createOscillator(),g=ac.createGain(),a=t0+l*r.p+x[1];o.type=r.w;o.frequency.value=x[0];g.gain.setValueAtTime(.0001,a);g.gain.exponentialRampToValueAtTime(Math.max(v,.0002),a+.02);g.gain.exponentialRampToValueAtTime(.0001,a+x[2]);o.connect(g);g.connect(ac.destination);o.start(a);o.stop(a+x[2]+.02);ringN.push(o)})}catch(e){}}
st.set.ringV=RINGS[st.set.ringV]?st.set.ringV:"klasik";st.set.ringG=RINGS[st.set.ringG]?st.set.ringG:"retro";
function ringSync(){[["ringVoice","ringV"],["ringVideo","ringG"]].forEach(a=>document.querySelectorAll("#"+a[0]+" button").forEach(b=>b.classList.toggle("on",b.dataset.k==st.set[a[1]])))}
[["ringVoice","ringV"],["ringVideo","ringG"]].forEach(a=>{const box=$(a[0]);Object.keys(RINGS).forEach(k=>{const b=document.createElement("button");b.type="button";b.textContent=RINGS[k].n;b.dataset.k=k;b.onclick=()=>{st.set[a[1]]=k;save();ringSync();ringPlay(k,1)};box.appendChild(b)})});
ringSync();
function sStSync(){const v=$("sStatus").value;$("sPh").dataset.st=v;$("sStx").value=st.set.stx||"";visSync();ringSync();document.querySelectorAll("#sStSeg button").forEach(b=>b.classList.toggle("on",b.dataset.v==v))}
document.querySelectorAll("#sStSeg button").forEach(b=>b.onclick=()=>{$("sStatus").value=b.dataset.v;sStSync();live()});
{const _fill=fill;fill=function(){_fill.apply(this,arguments);sStSync();smSync();$("sTimed").checked=!!st.set.timed}}
/* ===== süreli mesajlar: 24 saat konuşulmayan sohbetler herkesten silinir ===== */
const TIMED_MS=24*60*60*1000;
function purge(){if(!st.set.timed)return false;const n=Date.now();let ch=false;st.friends.forEach(f=>{if(f.h.length&&n-Math.max.apply(null,f.h.map(m=>m.ts||n))>=TIMED_MS){f.h=[];f.u=0;ch=true}});if(ch){save();renderList();renderMsgs()}return ch}
$("sTimed").addEventListener("change",()=>{st.set.timed=$("sTimed").checked;save();toast(st.set.timed?"Süreli mesajlar açıldı: 24 saat konuşulmazsa mesajlar silinir":"Süreli mesajlar kapatıldı");if(!purge())renderMsgs()});
setInterval(purge,60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)purge()});purge();
function myNpSync(){const c=st.set;if(!pfMe)return;$("pfNp").textContent=c.mus?"🎵 Dinlemeyi kapat":"🎵 Ne dinliyorum";$("pfm").textContent=c.mus?(c.song?"🎵 Şu an dinliyor: "+c.song:"🎵 Spotify'da şu an bir şey çalmıyor"):"";$("pfSpOff").style.display=c.sp?"":"none"}
function toggleListen(){const c=st.set;if(c.mus){c.mus=false;clearInterval(spT);spT=null;save();drawNp();myNpSync();return}if(!c.sp){if($("pf").style.display!="flex")openMyPF();$("pfSp").style.display="";$("pfSpUri").textContent=SPU();$("pfSpId").value=c.spId||"";return}c.mus=true;save();drawNp();spStart();myNpSync()}
$("npm").onclick=toggleListen;$("pfNp").onclick=toggleListen;$("pfSpGo").onclick=spAuth;
$("pfSpOff").onclick=()=>{const c=st.set;c.mus=false;c.song="";delete c.sp;clearInterval(spT);spT=null;save();drawNp();myNpSync();toast("Spotify bağlantısı kesildi")};
spHandle(location.href).then(spStart);
drawNp();
function applySet(){const c=st.set;document.documentElement.style.setProperty("--cy",c.col);$("myname").textContent=c.name;$("mydot").className="dot "+c.status;$("myav").className="av "+c.status;$("mypin").textContent=st.pin;$("myph").innerHTML=myAv();document.documentElement.style.setProperty("--fs",(c.fs||100)/100);document.body.classList.toggle("nt",!!c.night);applyBg();applyFC()}
function fill(){const c=st.set;$("sName").value=c.name;$("sStatus").value=c.status;$("sPin").textContent=st.pin;$("sSound").checked=c.sound;$("sNight").checked=!!c.night;$("sVol").value=c.vol;$("sShake").checked=c.shake;$("sInt").value=c.int;$("sVib").checked=c.vib;$("sRead").checked=c.read;$("sAuto").checked=c.auto!==false;$("sCol").value=c.col;$("sFs").value=c.fs||100;$("sFsV").textContent=(c.fs||100)+"%";fsSim();$("sPh").innerHTML=myAv();$("sVibNote").textContent=RetroHaptics.describeSupport()}
function readSet(){const c=st.set;c.name=$("sName").value.trim()||"Ahmet";c.status=$("sStatus").value;c.sound=$("sSound").checked;c.vol=+$("sVol").value;c.shake=$("sShake").checked;c.int=+$("sInt").value;c.vib=$("sVib").checked;c.read=$("sRead").checked;c.timed=$("sTimed").checked;c.auto=$("sAuto").checked;c.col=$("sCol").value;c.fs=+$("sFs").value;applySet();save();renderMsgs()}
$("gear").onclick=()=>{fill();$("set").classList.add("show");sPage(null)};
$("sClose").onclick=()=>{readSet();$("set").classList.remove("show")};
$("set").onclick=e=>{if(e.target.id=="set")$("sClose").onclick()};

$("sTest").onclick=()=>{readSet();shake()};
$("sClear").onclick=function(){if(this.dataset.a){st.friends.forEach(f=>f.h=[]);save();renderMsgs();this.textContent="Sohbetleri sil";delete this.dataset.a}else{this.dataset.a=1;this.textContent="Emin misin? Tekrar bas"}};


/* ----- Tema rengi: mor tonların hepsi seçilen renge bağlanır ----- */
const TR=[[180,76,255],[5,7,15],[180,76,255,0.2],[180,76,255,0.5],[180,76,255,0.1],[180,76,255,0.3],[11,16,32],[0,0,17],[51,51,85],[180,76,255,0.16],[178,102,255],[5,8,22],[241,242,255],[143,147,201],[22,26,66,0.62],[120,110,255,0.22],[10,13,51],[20,18,90],[58,29,143],[238,240,255],[27,31,75],[107,112,168],[110,90,230,0.25],[223,227,255],[201,194,255],[130,90,255,0.45],[168,92,255],[20,24,70,0.6],[143,107,255],[198,76,255],[150,90,255,0.6],[26,31,90],[16,20,63],[138,92,255],[11,14,51],[60,50,170,0.5],[120,70,230,0.35],[130,110,255,0.45],[6,9,24],[120,110,255,0.18],[248,249,255],[130,90,255,0.18],[140,110,255,0.25],[201,205,245],[74,79,138],[16,22,74],[12,18,64],[125,92,255],[110,120,255,0.6],[10,14,53],[18,22,68,0.82],[130,110,255,0.35],[181,140,255],[244,246,255],[246,247,255],[22,26,74],[207,211,245],[246,245,255],[207,198,255],[169,155,245],[27,31,58],[141,137,230],[154,148,238],[68,73,154],[220,217,251],[201,197,247],[42,47,106],[169,168,245],[236,233,255],[201,196,255],[244,244,255],[27,30,88],[58,63,154],[108,123,255],[59,63,143],[35,39,112],[154,85,245],[220,220,251],[201,201,244],[20,25,63],[233,230,255],[74,79,154],[217,213,251],[74,85,200],[95,124,255],[211,214,245],[27,31,90],[228,224,255],[242,244,255],[123,128,176],[239,233,251],[130,90,255,0.16],[122,92,240],[228,223,255],[232,227,255],[13,16,64],[40,35,95,0.38],[248,247,255],[235,231,255],[40,35,95,0.25],[220,220,246],[150,90,255,0.35],[150,90,255,0.55],[80,80,160,0.14],[40,35,95,0.35],[217,214,251],[120,100,220,0.15],[190,175,255,0.36],[14,18,64,0.5],[58,29,143,0.42],[6,9,24,0.5],[120,110,255,0.28],[30,40,120,0.32],[169,172,220],[29,33,96],[14,18,64,0.78],[130,120,255,0.4],[88,62,200,0.72],[14,18,64,0.7],[10,14,48,0.72],[14,18,64,0.92],[14,18,64,0.8],[20,26,58],[12,16,48],[16,21,58],[223,230,255],[249,250,255],[223,226,250],[154,160,212],[143,132,232],[143,132,232,0.4],[185,178,255],[47,50,88],[52,44,104],[124,128,165],[45,64,154],[25,34,106],[10,10,50,0.3],[228,231,255],[40,35,95,0.22],[40,35,95,0.18],[207,211,245,0.9],[14,18,64,0.42],[120,110,230,0.14],[10,14,48],[20,26,74],[14,18,56],[22,26,74,0.25],[22,26,74,0.35],[22,26,74,0.3],[74,47,176],[110,90,230,0.45],[208,76,255],[159,163,230],[138,143,216],[143,132,232,0.14],[143,132,232,0.35],[143,132,232,0.25],[167,139,250],[122,134,216],[188,192,245],[63,86,214],[232,233,255]];
function th_hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!=mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx==r?(g-b)/d+(g<b?6:0):mx==g?(b-r)/d+2:(r-g)/d+4;h*=60}return[h,s,l]}
function th_rgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return[r+m,g+m,b+m].map(v=>Math.round(Math.max(0,Math.min(1,v))*255))}
function th_lum(r,g,b){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)}
function th_map(r,g,b,C,night){
 const [h,s,l]=th_hsl(r,g,b),H=C[0],S=C[1],L=C[2],T=Math.min(1,S);let ns,nl=l;
 if(l>=.86){ns=s*T}                       /* açık zemin / pastel tonlar: aydınlık aynı kalır */
 else if(l<=.30){ns=s*T*.8}               /* koyu zemin / koyu yazı: karanlık aynı kalır */
 else if(s>=.5){                          /* vurgu (buton, simge, aktif sekme) */
  ns=Math.min(1,S*Math.min(1,s*1.05));nl=Math.max(.12,Math.min(.93,L+(l-.68)*.8));
  if(l<=.72){                             /* üstünde beyaz yazı/simge olan koyu-orta vurgular */
   while(th_lum(...th_rgb(H,ns,nl))>.36&&nl>.16)nl-=.02;
   if(night)while(th_lum(...th_rgb(H,ns,nl))<.10&&nl<.62)nl+=.02}
  else if(night){while(th_lum(...th_rgb(H,ns,nl))<.22&&nl<.9)nl+=.02}
 }else{ns=s*T}                            /* gri-mor yazı / çizgi tonları */
 return th_rgb(H,Math.max(0,Math.min(1,ns)),nl)}
function themeVars(hex){const st0=document.documentElement.style;
 if(!hex){TR.forEach((_,i)=>st0.removeProperty("--t"+i));return}
 const n=parseInt(hex.slice(1),16),C=th_hsl(n>>16&255,n>>8&255,n&255),night=document.body.classList.contains("nt");
 TR.forEach((t,i)=>{const m=th_map(t[0],t[1],t[2],C,night);st0.setProperty("--t"+i,t.length>3?"rgba("+m[0]+","+m[1]+","+m[2]+","+t[3]+")":"#"+m.map(v=>v.toString(16).padStart(2,"0")).join(""))})}
/* ----- Renkler sekmesi ----- */
const FCP=[["Turuncu","#ff9f0a"],["Kırmızı","#ff453a"],["Pembe","#ff6482"],["Mor","#bf5af2"],["Mavi","#0a84ff"],["Gök Mavisi","#64d2ff"],["Yeşil","#30d158"],["Nane","#63e6be"],["Sarı","#ffd60a"],["Taş","#a2845e"],["Gri","#8e8e93"],["Beyaz","#f2f2f7"],["Lacivert","#1f3a8a"],["Siyah","#1c1c1e"]];
function fcInfo(hex){const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255,mx=(t,a)=>"#"+[r,g,b].map(v=>Math.round(v+(t-v)*a).toString(16).padStart(2,"0")).join("");return{r,g,b,c1:hex,c2:mx(255,.32),c3:mx(0,.38),light:(.299*r+.587*g+.114*b)/255>.62}}
function applyFC(){const hex=st.set.fc,b=document.body,keys=["--fc1","--fc2","--fc3","--fcrgb"];if(!/^#[0-9a-f]{6}$/i.test(hex||"")){b.classList.remove("cfc","cfl");keys.forEach(k=>b.style.removeProperty(k));themeVars(null);return}themeVars(hex);const f=fcInfo(hex);b.style.setProperty("--fc1",f.c1);b.style.setProperty("--fc2",f.c2);b.style.setProperty("--fc3",f.c3);b.style.setProperty("--fcrgb",f.r+","+f.g+","+f.b);b.classList.add("cfc");b.classList.toggle("cfl",f.light)}
function drawFC(){const cur=(st.set.fc||"").toLowerCase(),p=FCP.find(x=>x[1]==cur);let h='<div class="fcs def'+(cur?"":" fcon")+'" data-c=""><i></i>Varsayılan</div>';FCP.forEach(x=>{h+='<div class="fcs'+(x[1]==cur?" fcon":"")+'" data-c="'+x[1]+'"><i style="background:'+x[1]+'"></i>'+x[0]+'</div>'});h+='<div class="fcs cus'+(cur&&!p?" fcon":"")+'"><i></i>Özel<input type="color" id="fcCus" value="'+(cur||"#0a84ff")+'"></div>';$("fcGrid").innerHTML=h;$("fcName").textContent=!cur?"Varsayılan":p?p[0]:"Özel";const pv=$("fcPrev");if(cur){const f=fcInfo(cur);pv.style.background="linear-gradient(135deg,"+f.c2+","+f.c1+" 62%,"+f.c3+")";pv.style.color=f.light?"#161a4a":"#fff"}else{pv.style.background="";pv.style.color=""}}
function setFC(hex){st.set.fc=hex||"";applyFC();drawFC();save()}
$("fcGrid").onclick=e=>{const t=e.target.closest(".fcs");if(!t||t.classList.contains("cus"))return;setFC(t.dataset.c)};
$("fcGrid").addEventListener("input",e=>{if(e.target.id=="fcCus"){st.set.fc=e.target.value;applyFC();const cur=st.set.fc;const pv=$("fcPrev"),f=fcInfo(cur);pv.style.background="linear-gradient(135deg,"+f.c2+","+f.c1+" 62%,"+f.c3+")";pv.style.color=f.light?"#161a4a":"#fff";$("fcName").textContent="Özel"}});
$("fcGrid").addEventListener("change",e=>{if(e.target.id=="fcCus"){setFC(e.target.value)}});
const SG={prof:"Profil",look:"Görünüm",snd:"Bildirimler ve ses",chat:"Sohbetler",dev:"Test araçları"};
function sPage(g){document.querySelectorAll("#sGen .spg").forEach(x=>x.style.display=x.id=="spg-"+g?"":"none");$("sMenu").style.display=g?"none":"";$("sSubHd").style.display=g?"flex":"none";$("sFrTop").style.display=g?"none":"";if(!g)smSync();if(g)$("sSubT").textContent=SG[g];if(g=="look")drawFC();$("sFrMain").scrollTop=0}
$("set").addEventListener("click",e=>{const r=e.target.closest(".sm");if(r&&r.dataset.g)sPage(r.dataset.g)});
$("sBack").onclick=()=>sPage(null);


/* sürgü: parmakla/fareyle kaydırınca da geçiş yapar */
(()=>{const t=$("sNight");let x0=null,skip=false;
t.addEventListener("pointerdown",e=>{x0=e.clientX;skip=false});
t.addEventListener("pointerup",e=>{if(x0==null)return;const dx=e.clientX-x0;x0=null;if(Math.abs(dx)>14){skip=true;const want=dx>0;if(want!=t.checked){t.checked=want;t.dispatchEvent(new Event("change",{bubbles:true}))}}});
t.addEventListener("click",e=>{if(skip){skip=false;e.preventDefault()}});
})();

applySet();
$("sNight").onchange=()=>{st.set.night=$("sNight").checked;applySet();save()};
const shCancel=e=>!!e&&(e.name=="AbortError"||/cancel|abort/i.test(e.message||""));
function shOpen(u){location.href=u}
async function shareText(t){
 try{const C=SPCap()&&SPCap().Share;if(C){await C.share({text:t});return}}catch(e){if(shCancel(e))return}
 if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"share",text:t}));return}
 try{if(navigator.share){await navigator.share({text:t});return}}catch(e){if(shCancel(e))return}
 shSheet(t)}
const SHI={"wa": "<svg viewBox=\"0 0 52 52\" width=\"52\" height=\"52\"><defs><linearGradient id=\"shgw\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#61fd7d\"/><stop offset=\"1\" stop-color=\"#2bb826\"/></linearGradient></defs><rect width=\"52\" height=\"52\" rx=\"12\" fill=\"url(#shgw)\"/><path d=\"M26 11.5a14.6 14.6 0 0 0-12.5 22l-2 7.5 7.7-2a14.6 14.6 0 1 0 6.8-27.5z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.8\" stroke-linejoin=\"round\"/><path d=\"M20.6 19.6c-.7.6-1.2 1.6-.9 2.8 1 3.7 4.7 7.4 8.5 8.4 1.2.3 2.2-.2 2.8-.9l1-1.4c.3-.4.2-.9-.2-1.2l-2.4-1.6c-.4-.2-.9-.1-1.2.2l-.9.9c-1.6-.7-3.3-2.4-4-4l.9-.9c.3-.3.4-.8.2-1.2L21.9 18.8c-.3-.4-.8-.5-1.2-.2z\" fill=\"#fff\"/></svg>", "tg": "<svg viewBox=\"0 0 52 52\" width=\"52\" height=\"52\"><defs><linearGradient id=\"shgt\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2aabee\"/><stop offset=\"1\" stop-color=\"#229ed9\"/></linearGradient></defs><rect width=\"52\" height=\"52\" rx=\"12\" fill=\"url(#shgt)\"/><path d=\"M11 25.4 39.8 14.3c1.3-.5 2.5.3 2 2.3l-4.9 23c-.4 1.6-1.3 2-2.6 1.2l-7.2-5.3-3.5 3.4c-.4.4-.7.7-1.5.7l.5-7.3L38 21.8c.6-.5-.1-.8-.9-.3L20.7 31.8l-7.1-2.2c-1.5-.5-1.5-1.5.4-2.2z\" fill=\"#fff\" transform=\"translate(-1 0) scale(1)\"/></svg>", "ms": "<svg viewBox=\"0 0 52 52\" width=\"52\" height=\"52\"><defs><linearGradient id=\"shgm\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#6cf06f\"/><stop offset=\"1\" stop-color=\"#1fbd3a\"/></linearGradient></defs><rect width=\"52\" height=\"52\" rx=\"12\" fill=\"url(#shgm)\"/><path d=\"M26 12.5c-8.3 0-15 5.2-15 11.7 0 3.7 2.2 7 5.6 9.1-.3 2.1-1.4 4-3 5.4 3.2-.2 6-1.5 8-3.3 1.4.3 2.9.5 4.4.5 8.3 0 15-5.2 15-11.7S34.300 12.500 26 12.500z\" fill=\"#fff\"/></svg>", "ml": "<svg viewBox=\"0 0 52 52\" width=\"52\" height=\"52\"><defs><linearGradient id=\"shge\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5bc4ff\"/><stop offset=\"1\" stop-color=\"#1a72f0\"/></linearGradient></defs><rect width=\"52\" height=\"52\" rx=\"12\" fill=\"url(#shge)\"/><rect x=\"10.500\" y=\"15.500\" width=\"31\" height=\"21.500\" rx=\"3.500\" fill=\"#fff\"/><path d=\"M12.500 19.500 26 29.500l13.500-10\" fill=\"none\" stroke=\"#2a7bf5\" stroke-width=\"2.600\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>", "cp": "<svg viewBox=\"0 0 52 52\" width=\"52\" height=\"52\"><defs><linearGradient id=\"shgc\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b0b5d8\"/><stop offset=\"1\" stop-color=\"#6b70a8\"/></linearGradient></defs><rect width=\"52\" height=\"52\" rx=\"12\" fill=\"url(#shgc)\"/><rect x=\"21\" y=\"19\" width=\"16\" height=\"19\" rx=\"3\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.800\"/><path d=\"M16 32V17a3 3 0 0 1 3-3h13\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.800\" stroke-linecap=\"round\"/></svg>"};
function shSheet(t){let o=$("shs");if(o)o.remove();o=document.createElement("div");o.id="shs";const e=encodeURIComponent(t),ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform=="MacIntel"&&navigator.maxTouchPoints>1);
 const A=[["Mesajlar",SHI.ms,()=>shOpen((ios?"sms:&body=":"sms:?body=")+e)],["WhatsApp",SHI.wa,()=>shOpen("https://wa.me/?text="+e)],["Telegram",SHI.tg,()=>shOpen("tg://msg?text="+e)],["E-posta",SHI.ml,()=>shOpen("mailto:?subject="+encodeURIComponent("RetroChat PIN")+"&body="+e)],["Kopyala",SHI.cp,()=>{try{navigator.clipboard.writeText(t)}catch(x){}toast("PIN panoya kopyalandı")}]];
 o.innerHTML='<div class="pn"><div class="gr"></div><b>Paylaş</b><div class="ap"></div><button class="cn">İptal</button></div>';
 A.forEach(a=>{const b=document.createElement("button");b.innerHTML='<i>'+a[1]+'</i><span>'+a[0]+'</span>';b.onclick=()=>{a[2]();o.remove()};o.querySelector(".ap").appendChild(b)});
 o.querySelector(".cn").onclick=()=>o.remove();o.onclick=ev=>{if(ev.target===o)o.remove()};document.body.appendChild(o)}
$("shr").onclick=()=>shareText("RetroChat PIN'im: "+st.pin);
$("cpy").onclick=()=>{try{navigator.clipboard.writeText(st.pin)}catch(e){}toast("PIN kopyalandı")};
$("spk").onclick=()=>$("q").focus();
let cview="chat";
const CAMI='<svg class="si" viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2.5" fill="currentColor"/><path d="M16 10l6-3v10l-6-3z" fill="currentColor"/></svg>',PHI='<svg class="si" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="currentColor"/></svg>';
function logCall(f,t,dir,dur,ts){st.calls=st.calls||[];st.calls.unshift({pin:f.pin,t:t=="video"?"video":"voice",dir,dur:dur||0,ts:ts||Date.now()});st.calls.length=Math.min(st.calls.length,100);save();if(cview=="call")renderCalls()}
function renderCalls(){const q=$("q").value.trim().toLowerCase(),td=new Date().toDateString(),yd=new Date(Date.now()-864e5).toDateString();let h="",last="";
(st.calls||[]).forEach(c=>{const f=st.friends.find(x=>x.pin==c.pin);if(!f||(q&&!f.n.toLowerCase().includes(q)))return;const i=st.friends.indexOf(f),d=new Date(c.ts),ds=d.toDateString(),g=ds==td?"Bugün":ds==yd?"Dün":d.toLocaleDateString("tr-TR");
if(g!=last){h+=`<div class="gh">${g}</div>`;last=g}
const bad=c.dir=="miss"||c.dir=="noans",ic=c.t=="video"?CAMI:PHI,lab=(c.t=="video"?"Görüntülü":"Sesli")+" · "+({out:"Giden",in:"Gelen",miss:"Cevapsız",noans:"Yanıtsız"})[c.dir]+(c.dur?" · "+fmtT(c.dur):"");
h+=`<div class="c" onclick="pick(${i})"><div class="av ${stc(f)}">${avH(f)}</div><div class="ci"><b class="${bad?"mc":""}">${esc(f.n)}</b><small>${ic}${lab}</small></div><div class="cr"><span class="tm">${d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</span></div><button class="cb" onclick="event.stopPropagation();pick(${i});startCall('${c.t}')" aria-label="Ara">${ic}</button></div>`});
$("clog").innerHTML=h||'<div style="text-align:center;opacity:.6;padding:40px 0">Henüz arama yok</div>'}
if(!st.calls){const H=36e5,S=[["Zeynep","video","in",432e3,2],["Mehmet","voice","miss",0,5],["Ayşe","voice","out",200e3,27],["Zeynep","voice","noans",0,50]];st.calls=[];S.forEach(a=>{const f=st.friends.find(x=>x.n==a[0]);if(f)st.calls.push({pin:f.pin,t:a[1],dir:a[2],dur:a[3],ts:Date.now()-a[4]*H})});save()}
const navB=[...document.querySelectorAll("#nav button")];
const CHV='<svg class="ch" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderPeople(){const q=$("q").value.trim().toLowerCase(),L={on:"Online",busy:"Meşgul",off:"Offline"};const a=st.friends.map((f,i)=>({f,i})).filter(x=>!q||x.f.n.toLowerCase().includes(q)||x.f.pin.toLowerCase().includes(q)).sort((x,y)=>x.f.n.localeCompare(y.f.n,"tr"));
$("clog").innerHTML=`<div class="gh">Kişiler (${a.length})</div>`+(a.map(({f,i})=>`<div class="c" onclick="pick(${i})"><div class="av ${stc(f)}">${avH(f)}</div><div class="ci"><b>${esc(f.n)}</b><small>${L[f.s]||""} · PIN: ${esc(f.pin)}</small></div>${CHV}</div>`).join("")||'<div style="text-align:center;opacity:.6;padding:40px 0">Kişi bulunamadı</div>')}
const renderView=()=>cview=="call"?renderCalls():renderPeople();
function setView(v){cview=v;$("list").style.display=v=="chat"?"":"none";$("clog").style.display=v=="chat"?"none":"";navB.forEach(x=>x.classList.toggle("on",x.dataset.n=={chat:"chat",call:"ntf",ppl:"ppl"}[v]));if(v!="chat")renderView()}
navB.forEach(b=>b.onclick=()=>{const n=b.dataset.n;if(n=="set")return $("gear").click();if(n=="ppl")return setView("ppl");if(n=="ntf")return setView("call");setView("chat");$("list").scrollTop=0});
$("q").addEventListener("input",()=>{if(cview!="chat")renderView()});
document.body.classList.add("lt");

function fsSim(){const v=+$("sFs").value,d=v-100;$("fsNew").style.fontSize=(15*v/100)+"px";$("fsNote").textContent=d==0?"Varsayılan boyut · %"+v:"Şimdi %"+v+" · normalden %"+Math.abs(d)+(d>0?" büyük":" küçük");$("fsBar").style.width=((v-80)/60*100)+"%"}
$("sFs").oninput=()=>{document.documentElement.style.setProperty("--fs",$("sFs").value/100);$("sFsV").textContent=$("sFs").value+"%";fsSim()};
$("hp").onclick=()=>{try{navigator.clipboard.writeText(st.friends[sel].pin)}catch(e){}toast("PIN kopyalandı")};
$("mtK").onclick=e=>{e.stopPropagation();$("kmenu").classList.toggle("show")};
$("kO").onclick=()=>{$("kmenu").classList.remove("show");$("mtO").click()};
$("kB").onclick=()=>{$("kmenu").classList.remove("show");$("mtB").click()};
document.addEventListener("click",()=>$("kmenu").classList.remove("show"));
renderList();renderMsgs();
/* ===== Birleştirilmiş Olaylar (Gerçek Zamanlı Transport, QR, Arkadaş Fotoğrafı, PIN Yenile) ===== */
function ensureFriendByPin(pin, prof) {
  pin = String(pin || "").toUpperCase();
  let f = st.friends.find((x) => x.pin === pin);
  if (!f) {
    f = {
      n: (prof && prof.name) || "Kişi " + pin.slice(-4),
      s: (prof && prof.status) || "on",
      e: (prof && prof.emo) || ["🧑", "👧", "👦", "🧔", "👩‍🎤", "🦊"][Math.random() * 6 | 0],
      pin,
      np: (prof && prof.song) || "",
      bio: (prof && prof.stx) || "",
      photo: (prof && prof.photo) || null,
      h: [],
      ls: "",
    };
    st.friends.push(f);
    if (!prof) RetroTransport.lookupPin(pin);
  }
  return f;
}

function applyRemoteProfile(user) {
  if (!user || !user.pin) return;
  const f = st.friends.find((x) => x.pin === user.pin);
  if (!f) return;
  if (user.name) f.n = user.name;
  if (user.status) f.s = user.status;
  if (user.song != null) f.np = user.song;
  if (user.stx != null) f.bio = user.stx;
  if (user.photo) f.photo = user.photo;
  else if (user.emo) f.e = user.emo;
  if (user.lastSeen) {
    const d = new Date(user.lastSeen);
    f.ls = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }
}

function markChatRead(f) {
  if (!f || !RetroTransport.isLive()) return;
  const ids = f.h.filter((m) => !m.me && !m._readSent && m.id).map((m) => {
    m._readSent = true;
    return m.id;
  });
  if (ids.length) RetroTransport.sendRead(f, ids);
}

// Sohbet açıldığında okundu bilgisi gönder
const _origPick = pick;
pick = function (i) {
  _origPick(i);
  markChatRead(st.friends[i]);
};

// Tek seferlik / süreli medya kapatıldığında karşı tarafa bildir
const _origCloseMed = closeMed;
closeMed = function () {
  const m = cur;
  _origCloseMed();
  if (m && !m.me && m.med && m.med.mode !== "normal" && RetroTransport.isLive()) {
    RetroTransport.sendMediaOpened(st.friends[sel], m.id);
  }
};

// Kişi eklenince sunucudan gerçek profilini sorgula
const _origAddFriend = addFriend;
addFriend = function (n, p) {
  const err = _origAddFriend(n, p);
  if (!err && RetroTransport.isLive()) {
    RetroTransport.lookupPin(String(p || "").trim().toUpperCase());
  }
  return err;
};

// Profil/durum/şarkı değişince sunucuya yayınla
const _origApplySet = applySet;
applySet = function () {
  _origApplySet();
  if (RetroTransport.isLive()) RetroTransport.sendProfile(st);
};

// Yazıyor göstergesi gönderimi
let _tyTimer = null;
let _tyActive = false;
$("in").addEventListener("input", () => {
  if (!RetroTransport.isLive()) return;
  const f = st.friends[sel];
  if (!f) return;
  if (!_tyActive && $("in").value.trim()) {
    _tyActive = true;
    RetroTransport.sendTyping(f, true);
  }
  clearTimeout(_tyTimer);
  _tyTimer = setTimeout(() => {
    if (_tyActive) {
      _tyActive = false;
      RetroTransport.sendTyping(f, false);
    }
  }, 2000);
});

RetroTransport.init({
  getState: () => st,
  onLocalDeliver: deliver,
  onStatus: (state, label) => {
    const el = $("status");
    if (el) el.textContent = label;
    if (state === "online") {
      // Canlı modda sahte test botlarını durdur
      clearTimeout(autoT);
    }
  },
  onAuthOk: (presences) => {
    presences.forEach(applyRemoteProfile);
    save();
    renderList();
    renderMsgs();
  },
  onPinTaken: () => {
    RetroTransport.regeneratePin(st);
    applySet();
    save();
    toast("PIN çakıştı, yeni PIN atandı: " + st.pin);
    RetroTransport.connect();
  },
  onPresence: (user) => {
    applyRemoteProfile(user);
    save();
    renderList();
    if (st.friends[sel] && st.friends[sel].pin === user.pin) renderMsgs();
  },
  onLookupResult: (pin, user) => {
    if (user) {
      applyRemoteProfile(user);
      save();
      renderList();
      if (st.friends[sel] && st.friends[sel].pin === pin) renderMsgs();
    }
  },
  onMessage: (fromPin, msg) => {
    const f = ensureFriendByPin(fromPin);
    const incoming = Object.assign({}, msg, { me: 0, at: msg.at || t(), ts: Date.now() });
    f.h.push(incoming);
    const viewing = st.friends[sel] === f && $("app").classList.contains("open");
    if (viewing) {
      markChatRead(f);
    } else {
      f.u = (f.u || 0) + 1;
      notify(f, incoming);
    }
    save();
    renderMsgs();
  },
  onNudge: (fromPin) => {
    const f = ensureFriendByPin(fromPin);
    const ev = { k: "n", me: 0, id: uid(), ts: Date.now() };
    f.h.push(ev);
    const viewing = st.friends[sel] === f && $("app").classList.contains("open");
    if (!viewing) {
      f.u = (f.u || 0) + 1;
      notify(f, ev);
    }
    // Ekran sallanması + ses + GERÇEK FİZİKSEL TELEFON TİTREŞİMİ
    shake();
    save();
    renderMsgs();
  },
  onDelivered: (fromPin, msgId) => {
    const f = st.friends.find((x) => x.pin === fromPin);
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (m && (m.st || 0) < 1) {
      m.st = 1;
      save();
      renderMsgs();
    }
  },
  onRead: (fromPin, msgIds) => {
    const f = st.friends.find((x) => x.pin === fromPin);
    if (!f) return;
    let ch = false;
    f.h.forEach((m) => {
      if (m.me && (!msgIds.length || msgIds.includes(m.id)) && (m.st || 0) < 2) {
        m.st = 2;
        ch = true;
      }
    });
    if (ch) {
      save();
      renderMsgs();
    }
  },
  onTyping: (fromPin, isTyping) => {
    typing[fromPin] = isTyping ? 1 : 0;
    renderMsgs();
  },
  onDeleteForAll: (fromPin, msgId) => {
    const f = st.friends.find((x) => x.pin === fromPin);
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (m) {
      m.del = true;
      m.img = null;
      m.med = null;
      delete vmem[msgId];
      save();
      renderMsgs();
    }
  },
  onMediaOpened: (fromPin, msgId) => {
    const f = st.friends.find((x) => x.pin === fromPin);
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (m && m.med) {
      m.med.gone = true;
      m.med.src = null;
      delete vmem[msgId];
      save();
      renderMsgs();
    }
  },
  onCallEvent: (ev) => {
    if (window.RetroCalls) RetroCalls.handleEvent(ev);
  },
  onGameEvent: (ev) => {
    if (window.RetroGames) RetroGames.handleEvent(ev);
  },
});

if (window.RetroGames) {
  RetroGames.init({
    getState: () => st,
    ensureFriendByPin,
    esc,
    uid,
    toast,
    save,
    renderMsgs,
  });
  const _origStartGame = startGame;
  startGame = function (k) {
    if (RetroTransport.isLive()) {
      const f = st.friends[sel];
      if (!f) return;
      RetroGames.invite(f, k);
      return;
    }
    _origStartGame(k);
  };
  const _origGbClick = $("gb").onclick;
  $("gb").onclick = function (e) {
    if (RetroGames.isActive()) {
      RetroGames.onBoardClick(e);
      return;
    }
    if (_origGbClick) _origGbClick.call(this, e);
  };
  const _origGAgain = $("gAgain").onclick;
  $("gAgain").onclick = function () {
    if (RetroGames.isActive()) {
      RetroGames.rematch();
      return;
    }
    if (_origGAgain) _origGAgain.call(this);
  };
  const _origGX = $("gX").onclick;
  $("gX").onclick = function () {
    if (RetroGames.isActive()) {
      RetroGames.end(true);
      return;
    }
    if (_origGX) _origGX.call(this);
  };
}

if (window.RetroCalls) {
  RetroCalls.init({
    getState: () => st,
    ensureFriendByPin,
    avH,
    esc,
    uid,
    toast,
    save,
    renderMsgs,
    logCall,
    ringPlay,
    ringStop,
  });
  const _origStartCall = startCall;
  startCall = function (ty) {
    if (RetroTransport.isLive()) {
      const f = st.friends[sel];
      if (!f) return;
      RetroCalls.start(f, ty);
      return;
    }
    _origStartCall(ty);
  };
}

$("pfGal").onclick=()=>pickGallery(cbF);
$("pfCam").onclick=()=>pickCamera(cbF);
$("pfQr").onclick=()=>{if(pfMe)QR.showQR(st.set.name,st.pin);else{const f=st.friends[pfi];QR.showQR(f.n,f.pin)}};
$("sQr").onclick=()=>QR.showQR(st.set.name,st.pin);
$("kQ").onclick=()=>{$("kmenu").classList.remove("show");QR.showQR(st.set.name,st.pin)};
$("sNewPin").onclick=function(){
 if(this.dataset.ok){
  RetroTransport.regeneratePin(st);
  $("sPin").textContent=st.pin;
  applySet();save();
  if(RetroTransport.isLive())RetroTransport.connect();
  this.textContent="Yenile";delete this.dataset.ok;
  toast("Yeni PIN oluşturuldu: "+st.pin);
 }else{
  this.dataset.ok=1;this.textContent="Emin misin?";
  setTimeout(()=>{if(this.dataset.ok){this.textContent="Yenile";delete this.dataset.ok}},4000);
 }
};