const cfg = window.SUPABASE_CONFIG;
const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
let session=null, profile=null, areas=[], logs=[], currentRun=null, selectedFloor=null, selectedStatus='';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const today=()=>new Date().toLocaleDateString('en-CA');
const startOfToday=()=>new Date(`${today()}T00:00:00`).toISOString();
const endOfToday=()=>new Date(`${today()}T23:59:59.999`).toISOString();
function isManager(){return ['admin','coordinator'].includes(profile?.role)}
function escapeHtml(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]))}
function toast(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),2400)}
function setBusy(on){document.body.classList.toggle('busy',on)}

async function boot(){
  bind();
  const {data:{session:s}}=await sb.auth.getSession();
  if(s) await enterApp(s);
}
function bind(){
  $('#loginForm').addEventListener('submit',login);
  $('#logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
  $('#menuBtn').onclick=()=>$('#nav').classList.toggle('hidden');
  $$('.nav-link').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $('#backFloors').onclick=()=>{selectedFloor=null;$('#floorDetail').classList.add('hidden');$('#floorGrid').classList.remove('hidden')};
  $('#resetDayBtn').onclick=createRun;
  $('#saveStatus').onclick=saveStatus;
  $$('.status-btn').forEach(b=>b.onclick=()=>{$$('.status-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selectedStatus=b.dataset.status});
  $('#exportCsv').onclick=exportCsv; $('#applyFilters').onclick=loadReports;
  $('#addAreaBtn').onclick=()=>openAreaEditor(); $('#saveArea').onclick=saveArea;
  $('#areaFloorFilter').onchange=renderAreasAdmin; $('#areaSearch').oninput=renderAreasAdmin;
}
async function login(e){
  e.preventDefault(); $('#loginError').textContent=''; setBusy(true);
  const {data,error}=await sb.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});
  setBusy(false);
  if(error){$('#loginError').textContent='No fue posible ingresar. Revise el correo y la contraseña.';return}
  await enterApp(data.session);
}
async function enterApp(s){
  session=s;
  let {data:p,error}=await sb.from('crl_profiles').select('*').eq('id',session.user.id).maybeSingle();
  if(error){$('#loginError').textContent='La cuenta no tiene acceso configurado para esta aplicación.';await sb.auth.signOut();return}
  if(!p){$('#loginError').textContent='La cuenta todavía no tiene perfil en la aplicación.';await sb.auth.signOut();return}
  if(!p.active){$('#loginError').textContent='Esta cuenta está inactiva.';await sb.auth.signOut();return}
  profile=p;
  $('#authView').classList.add('hidden'); $('#appShell').classList.remove('hidden');
  $('#todayLabel').textContent=new Intl.DateTimeFormat('es-CR',{dateStyle:'long'}).format(new Date());
  $('#currentUser').textContent=profile.full_name||session.user.email;
  $('#userName').value=profile.full_name||''; $('#userRole').value=roleLabel(profile.role); $('#userEmail').value=session.user.email||'';
  $$('.admin-only').forEach(x=>x.classList.toggle('hidden',!isManager()));
  if(!isManager()) $('#reportsView .section-title h2').textContent='Mis reportes';
  await Promise.all([loadAreas(),loadTodayLogs(),loadCurrentRun()]); renderFloors();
}
function roleLabel(r){return ({admin:'Administrador',coordinator:'Coordinación',staff:'Personal operativo'})[r]||r}
async function loadAreas(){
  const {data,error}=await sb.from('crl_areas').select('*').order('floor').order('display_order');
  if(error) throw error; areas=(data||[]).map(a=>({...a,type:a.area_type,order:a.display_order}));
}
async function loadTodayLogs(){
  const {data,error}=await sb.from('crl_cleaning_logs').select('*,crl_areas(name,code,floor,area_type)').gte('recorded_at',startOfToday()).lte('recorded_at',endOfToday()).order('recorded_at');
  if(error) throw error; logs=data||[];
}
async function loadCurrentRun(){
  const {data}=await sb.from('crl_runs').select('*').eq('user_id',session.user.id).eq('status','open').order('started_at',{ascending:false}).limit(1).maybeSingle();
  currentRun=data||null;
}
async function createRun(){
  setBusy(true);
  if(currentRun) await sb.from('crl_runs').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',currentRun.id);
  const {data,error}=await sb.from('crl_runs').insert({user_id:session.user.id,status:'open'}).select().single();
  setBusy(false); if(error)return toast('No se pudo iniciar el recorrido'); currentRun=data;toast('Nuevo recorrido iniciado');
}
function showView(name){
  $$('.view').forEach(v=>v.classList.add('hidden')); $('#'+name+'View').classList.remove('hidden');
  $$('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.view===name)); $('#nav').classList.add('hidden');
  if(name==='pending')renderPending(); if(name==='reports')loadReports(); if(name==='areas')renderAreasAdmin();
}
function latestFor(areaId){return [...logs].reverse().find(l=>l.area_id===areaId)}
function statusClass(s){return {'Limpio':'s-clean','Área ocupada':'s-occupied','Reprogramado':'s-rescheduled','Requiere atención':'s-attention'}[s]||'s-pending'}
function renderFloors(){
  const floors=[...new Set(areas.filter(a=>a.active).map(a=>a.floor))].sort((a,b)=>a-b);
  $('#floorGrid').innerHTML=floors.map(f=>{let a=areas.filter(x=>x.floor===f&&x.active),done=a.filter(x=>latestFor(x.id)?.status==='Limpio').length,p=a.length?Math.round(done/a.length*100):0;return `<article class="floor-card card" onclick="openFloor(${f})"><div class="floor-top"><span class="floor-number">Piso ${f}</span><span class="floor-count">${done} / ${a.length}</span></div><div class="progress"><span style="width:${p}%"></span></div><span class="area-meta">${p}% completado</span></article>`}).join('');
}
window.openFloor=function(f){selectedFloor=f;$('#floorGrid').classList.add('hidden');$('#floorDetail').classList.remove('hidden');$('#floorEyebrow').textContent='RECORRIDO';$('#floorTitle').textContent='Piso '+f;renderAreaList()}
function renderAreaList(){
  const arr=areas.filter(x=>x.floor===selectedFloor&&x.active).sort((a,b)=>a.order-b.order);
  $('#areaList').innerHTML=arr.map(a=>{let l=latestFor(a.id),s=l?.status||'Pendiente';return `<article class="area-card card"><div><p class="eyebrow">${escapeHtml(a.code)}</p><h3>${escapeHtml(a.name)}</h3><span class="area-meta">${escapeHtml(a.type)}${l?.note?' · '+escapeHtml(l.note):''}</span></div><button class="state-pill ${statusClass(s)}" onclick="openStatus('${a.id}')">${s}</button></article>`}).join('')||'<div class="card area-card">No hay áreas activas.</div>';renderFloors();
}
window.openStatus=function(id){
  const a=areas.find(x=>x.id===id),l=latestFor(id); $('#statusAreaId').value=id;$('#statusAreaCode').textContent=a.code;$('#statusAreaName').textContent=a.name;
  $('#statusNote').value=l?.note||'';$('#rescheduleTime').value=l?.reschedule_time?.slice(0,5)||'';selectedStatus=l?.status||'';
  $$('.status-btn').forEach(b=>b.classList.toggle('selected',b.dataset.status===selectedStatus));$('#statusDialog').showModal();
}
async function saveStatus(){
  const areaId=$('#statusAreaId').value;if(!selectedStatus)return toast('Seleccione un estado');if(!currentRun)await createRun();
  const payload={run_id:currentRun?.id||null,area_id:areaId,user_id:session.user.id,status:selectedStatus,note:$('#statusNote').value.trim(),reschedule_time:$('#rescheduleTime').value||null};
  setBusy(true);const {data,error}=await sb.from('crl_cleaning_logs').insert(payload).select('*,crl_areas(name,code,floor,area_type)').single();setBusy(false);
  if(error)return toast('No se pudo guardar');logs.push(data);$('#statusDialog').close();renderAreaList();toast('Estado guardado');
}
function renderPending(){
  const items=areas.map(a=>({a,l:latestFor(a.id)})).filter(x=>x.l&&x.l.status!=='Limpio');
  $('#pendingList').innerHTML=items.map(({a,l})=>`<article class="area-card card"><div><p class="eyebrow">PISO ${a.floor} · ${escapeHtml(a.code)}</p><h3>${escapeHtml(a.name)}</h3><span class="area-meta">${escapeHtml(l.note||'Sin observación')}${l.reschedule_time?' · Retomar '+l.reschedule_time.slice(0,5):''}</span></div><button class="state-pill ${statusClass(l.status)}" onclick="openStatus('${a.id}')">${l.status}</button></article>`).join('')||'<div class="card area-card">No hay pendientes registrados hoy.</div>';
}
async function loadReports(){
  const from=$('#dateFrom').value,to=$('#dateTo').value,f=$('#reportFloor').value;
  let q=sb.from('crl_cleaning_logs').select('*,crl_areas(name,code,floor,area_type),crl_profiles(full_name)').order('recorded_at',{ascending:false}).limit(5000);
  if(from)q=q.gte('recorded_at',new Date(`${from}T00:00:00`).toISOString()); if(to)q=q.lte('recorded_at',new Date(`${to}T23:59:59.999`).toISOString());
  const {data,error}=await q; if(error)return toast('No se pudo cargar el reporte');
  let rows=(data||[]).filter(r=>!f||String(r.crl_areas?.floor)===f);renderReports(rows);
}
function renderReports(rows){
  const clean=rows.filter(x=>x.status==='Limpio').length,pend=rows.length-clean,rate=rows.length?Math.round(clean/rows.length*100):0;
  $('#kpis').innerHTML=[['Cumplimiento',rate+'%'],['Registros',rows.length],['Limpios',clean],['Pendientes',pend]].map(x=>`<div class="kpi card"><span class="label">${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  $('#reportBody').innerHTML=rows.map(l=>{const d=new Date(l.recorded_at);return `<tr><td>${d.toLocaleDateString('es-CR')}</td><td>${d.toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit'})}</td><td>${l.crl_areas?.floor??''}</td><td>${escapeHtml(l.crl_areas?.name||'')}</td><td><span class="state-pill ${statusClass(l.status)}">${l.status}</span></td><td>${escapeHtml(l.crl_profiles?.full_name||session.user.email)}</td><td>${escapeHtml(l.note||'')}</td></tr>`}).join('');
  window.reportRows=rows;
}
function exportCsv(){
  const rows=window.reportRows||[],data=[['Fecha','Hora','Piso','Área','Estado','Responsable','Observación','Reprogramado para'],...rows.map(l=>{const d=new Date(l.recorded_at);return[d.toLocaleDateString('es-CR'),d.toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit'}),l.crl_areas?.floor||'',l.crl_areas?.name||'',l.status,l.crl_profiles?.full_name||session.user.email,l.note||'',l.reschedule_time||'']})];
  const csv='\ufeff'+data.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='reporte_recorridos_'+today()+'.csv';a.click();URL.revokeObjectURL(a.href);
}
function renderAreasAdmin(){
  if(!isManager())return;const f=$('#areaFloorFilter').value,q=$('#areaSearch').value.toLowerCase();const arr=areas.filter(a=>(!f||String(a.floor)===f)&&(!q||[a.name,a.code,a.type].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.floor-b.floor||a.order-b.order);
  $('#areasBody').innerHTML=arr.map(a=>`<tr><td>${a.order}</td><td>${a.floor}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.code)}</td><td>${escapeHtml(a.type)}</td><td>${a.active?'Activa':'Inactiva'}</td><td><div class="actions"><button class="action-btn" onclick="openAreaEditor('${a.id}')">Editar</button><button class="action-btn" onclick="deleteArea('${a.id}')">Eliminar</button></div></td></tr>`).join('');
}
window.openAreaEditor=function(id){
  const a=id?areas.find(x=>x.id===id):null;$('#areaDialogTitle').textContent=a?'Editar área':'Agregar área';$('#editAreaId').value=a?.id||'';$('#editFloor').value=a?.floor||1;$('#editOrder').value=a?.order||(areas.filter(x=>x.floor===1).length+1);$('#editName').value=a?.name||'';$('#editCode').value=a?.code||'';$('#editType').value=a?.type||'';$('#editNotes').value=a?.notes||'';$('#editActive').checked=a?.active??true;$('#areaDialog').showModal();
}
async function saveArea(){
  const id=$('#editAreaId').value,payload={floor:+$('#editFloor').value,display_order:+$('#editOrder').value,name:$('#editName').value.trim(),code:$('#editCode').value.trim(),area_type:$('#editType').value.trim(),notes:$('#editNotes').value.trim(),active:$('#editActive').checked,updated_at:new Date().toISOString()};
  if(!payload.name||!payload.code||!payload.area_type)return toast('Complete los datos requeridos');setBusy(true);
  const r=id?await sb.from('crl_areas').update(payload).eq('id',id):await sb.from('crl_areas').insert(payload);setBusy(false);if(r.error)return toast(r.error.code==='23505'?'El código ya existe':'No se pudo guardar');
  await loadAreas();$('#areaDialog').close();renderAreasAdmin();renderFloors();toast('Área guardada');
}
window.deleteArea=async function(id){
  if(!confirm('¿Eliminar esta área? Si tiene historial, se desactivará.'))return;setBusy(true);const {error}=await sb.from('crl_areas').delete().eq('id',id);if(error?.code==='23503'){await sb.from('crl_areas').update({active:false,updated_at:new Date().toISOString()}).eq('id',id);toast('El área tiene historial y fue desactivada')}else if(error)toast('No se pudo eliminar');else toast('Área eliminada');setBusy(false);await loadAreas();renderAreasAdmin();renderFloors();
}
boot().catch(e=>{console.error(e);$('#loginError').textContent='Ocurrió un error al iniciar la aplicación.'});
