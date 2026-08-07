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
function initials(name){return String(name||'U').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function roleLabel(r){return ({admin:'Administrador',coordinator:'Coordinación',staff:'Personal operativo'})[r]||r}
function pageMeta(name){return ({dashboard:['RESUMEN','Inicio'],home:['OPERACIÓN','Recorrido'],pending:['SEGUIMIENTO','Pendientes'],reports:['ANÁLISIS','Reportes'],areas:['ADMINISTRACIÓN','Áreas'],settings:['CUENTA','Mi cuenta']})[name]||['','']}

async function boot(){bind();const {data:{session:s}}=await sb.auth.getSession();if(s)await enterApp(s)}
function bind(){
  $('#loginForm').addEventListener('submit',login);
  $('#logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
  $('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
  $$('.nav-link').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $$('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
  $('#quickRunBtn').onclick=async()=>{await createRun();showView('home')};
  $('#startFromDashboard').onclick=async()=>{if(!currentRun)await createRun();showView('home')};
  $('#backFloors').onclick=()=>{selectedFloor=null;$('#floorDetail').classList.add('hidden');$('#floorGrid').classList.remove('hidden')};
  $('#resetDayBtn').onclick=createRun;
  $('#saveStatus').onclick=saveStatus;
  $$('.status-btn').forEach(b=>b.onclick=()=>{$$('.status-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selectedStatus=b.dataset.status});
  $('#exportXlsx').onclick=exportXlsx;$('#applyFilters').onclick=loadReports;
  $('#addAreaBtn').onclick=()=>openAreaEditor();$('#saveArea').onclick=saveArea;
  $('#areaFloorFilter').onchange=renderAreasAdmin;$('#areaSearch').oninput=renderAreasAdmin;
}
async function login(e){e.preventDefault();$('#loginError').textContent='';setBusy(true);const {data,error}=await sb.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});setBusy(false);if(error){$('#loginError').textContent='No fue posible ingresar. Revisa el correo y la contraseña.';return}await enterApp(data.session)}
async function enterApp(s){
  session=s;let {data:p,error}=await sb.from('crl_profiles').select('*').eq('id',session.user.id).maybeSingle();
  if(error||!p){$('#loginError').textContent='La cuenta todavía no tiene acceso configurado.';await sb.auth.signOut();return}
  if(!p.active){$('#loginError').textContent='Esta cuenta está inactiva.';await sb.auth.signOut();return}
  profile=p;$('#authView').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const full=profile.full_name||session.user.email, ini=initials(full), role=roleLabel(profile.role), longDate=new Intl.DateTimeFormat('es-CR',{dateStyle:'long'}).format(new Date());
  $('#sidebarUser').textContent=full;$('#sidebarRole').textContent=role;$('#userInitials').textContent=ini;$('#settingsInitials').textContent=ini;$('#settingsName').textContent=full;$('#settingsRole').textContent=role;
  $('#dashboardName').textContent=full.split(' ')[0];$('#dashboardDate').textContent=longDate;$('#todayCompact').textContent=longDate;
  $('#userName').value=full;$('#userRole').value=role;$('#userEmail').value=session.user.email||'';
  $$('.admin-only').forEach(x=>x.classList.toggle('hidden',!isManager()));
  await Promise.all([loadAreas(),loadTodayLogs(),loadCurrentRun()]);renderAll();showView('dashboard');
}
async function loadAreas(){const {data,error}=await sb.from('crl_areas').select('*').order('floor').order('display_order');if(error)throw error;areas=(data||[]).map(a=>({...a,type:a.area_type,order:a.display_order}))}
async function loadTodayLogs(){const {data,error}=await sb.from('crl_cleaning_logs').select('*,crl_areas(name,code,floor,area_type)').gte('recorded_at',startOfToday()).lte('recorded_at',endOfToday()).order('recorded_at');if(error)throw error;logs=data||[]}
async function loadCurrentRun(){const {data}=await sb.from('crl_runs').select('*').eq('user_id',session.user.id).eq('status','open').order('started_at',{ascending:false}).limit(1).maybeSingle();currentRun=data||null}
async function createRun(){setBusy(true);if(currentRun)await sb.from('crl_runs').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',currentRun.id);const {data,error}=await sb.from('crl_runs').insert({user_id:session.user.id,status:'open'}).select().single();setBusy(false);if(error)return toast('No se pudo iniciar el recorrido');currentRun=data;toast('Nuevo recorrido iniciado');renderDashboard()}
function showView(name){$$('.view').forEach(v=>v.classList.add('hidden'));$('#'+name+'View').classList.remove('hidden');$$('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.view===name));$('.sidebar').classList.remove('open');const [e,t]=pageMeta(name);$('#pageEyebrow').textContent=e;$('#pageTitle').textContent=t;if(name==='dashboard')renderDashboard();if(name==='pending')renderPending();if(name==='reports')loadReports();if(name==='areas')renderAreasAdmin()}
function latestFor(areaId){return [...logs].reverse().find(l=>l.area_id===areaId)}
function statusClass(s){return {'Limpio':'s-clean','Área ocupada':'s-occupied','Reprogramado':'s-rescheduled','Requiere atención':'s-attention'}[s]||'s-pending'}
function activeAreas(){return areas.filter(a=>a.active)}
function renderAll(){renderFloors();renderDashboard()}
function renderDashboard(){
  const active=activeAreas(),clean=active.filter(a=>latestFor(a.id)?.status==='Limpio').length,pending=active.filter(a=>{const s=latestFor(a.id)?.status;return s&&s!=='Limpio'}).length,unvisited=active.length-clean-pending,rate=active.length?Math.round(clean/active.length*100):0;
  $('#dashboardKpis').innerHTML=[['Cumplimiento',rate+'%','del edificio'],['Áreas limpias',clean,'de '+active.length],['Pendientes',pending,'requieren seguimiento'],['Sin revisar',unvisited,'áreas restantes']].map(x=>`<article class="metric-card"><span class="label">${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');
  const floors=[...new Set(active.map(a=>a.floor))].sort((a,b)=>a-b);
  $('#dashboardFloors').innerHTML=floors.map(f=>{const arr=active.filter(a=>a.floor===f),done=arr.filter(a=>latestFor(a.id)?.status==='Limpio').length,p=arr.length?Math.round(done/arr.length*100):0;return `<div class="dashboard-floor-row"><strong>Piso ${f}</strong><div class="progress"><span style="width:${p}%"></span></div><span>${p}%</span></div>`}).join('');
  const pend=active.map(a=>({a,l:latestFor(a.id)})).filter(x=>x.l&&x.l.status!=='Limpio').slice(0,5);
  $('#dashboardPending').innerHTML=pend.length?pend.map(({a,l})=>`<div class="summary-item"><div class="summary-icon">!</div><div><strong>${escapeHtml(a.name)}</strong><span>Piso ${a.floor} · ${escapeHtml(l.status)}${l.reschedule_time?' · '+l.reschedule_time.slice(0,5):''}</span></div></div>`).join(''):'<div class="summary-item"><div class="summary-icon">✓</div><div><strong>Sin pendientes registrados</strong><span>El recorrido está al día.</span></div></div>';
}
function renderFloors(){
  const floors=[...new Set(activeAreas().map(a=>a.floor))].sort((a,b)=>a-b);
  $('#floorGrid').innerHTML=floors.map(f=>{const arr=activeAreas().filter(x=>x.floor===f),done=arr.filter(x=>latestFor(x.id)?.status==='Limpio').length,p=arr.length?Math.round(done/arr.length*100):0;return `<article class="floor-card" onclick="openFloor(${f})"><div class="floor-card-head"><div class="floor-badge">${f}</div><div class="floor-percent">${p}%</div></div><h3>Piso ${f}</h3><p>${arr.length} áreas registradas</p><div class="progress"><span style="width:${p}%"></span></div><div class="floor-card-foot"><span>${done} limpias</span><span>${arr.length-done} restantes</span></div></article>`}).join('')
}
window.openFloor=function(f){selectedFloor=f;$('#floorGrid').classList.add('hidden');$('#floorDetail').classList.remove('hidden');$('#floorEyebrow').textContent='RECORRIDO';$('#floorTitle').textContent='Piso '+f;const arr=activeAreas().filter(a=>a.floor===f),done=arr.filter(a=>latestFor(a.id)?.status==='Limpio').length;$('#floorSubtitle').textContent=`${done} de ${arr.length} áreas completadas`;renderAreaList()}
function renderAreaList(){const arr=activeAreas().filter(x=>x.floor===selectedFloor).sort((a,b)=>a.order-b.order);$('#areaList').innerHTML=arr.map(a=>{const l=latestFor(a.id),s=l?.status||'Pendiente';return `<article class="area-card"><div class="area-order">${a.order}</div><div><p class="eyebrow">${escapeHtml(a.code)}</p><h3>${escapeHtml(a.name)}</h3><span class="area-meta">${escapeHtml(a.type)}${l?.note?' · '+escapeHtml(l.note):''}</span></div><button class="state-pill ${statusClass(s)}" onclick="openStatus('${a.id}')">${s}</button></article>`}).join('')||'<div class="panel area-card">No hay áreas activas.</div>';renderFloors();renderDashboard()}
window.openStatus=function(id){const a=areas.find(x=>x.id===id),l=latestFor(id);$('#statusAreaId').value=id;$('#statusAreaCode').textContent=a.code;$('#statusAreaName').textContent=a.name;$('#statusNote').value=l?.note||'';$('#rescheduleTime').value=l?.reschedule_time?.slice(0,5)||'';selectedStatus=l?.status||'';$$('.status-btn').forEach(b=>b.classList.toggle('selected',b.dataset.status===selectedStatus));$('#statusDialog').showModal()}
async function saveStatus(){const areaId=$('#statusAreaId').value;if(!selectedStatus)return toast('Selecciona un estado');if(!currentRun)await createRun();const payload={run_id:currentRun?.id||null,area_id:areaId,user_id:session.user.id,status:selectedStatus,note:$('#statusNote').value.trim(),reschedule_time:$('#rescheduleTime').value||null};setBusy(true);const {data,error}=await sb.from('crl_cleaning_logs').insert(payload).select('*,crl_areas(name,code,floor,area_type)').single();setBusy(false);if(error)return toast('No se pudo guardar');logs.push(data);$('#statusDialog').close();renderAreaList();toast('Estado guardado')}
function renderPending(){const items=activeAreas().map(a=>({a,l:latestFor(a.id)})).filter(x=>x.l&&x.l.status!=='Limpio');$('#pendingList').innerHTML=items.map(({a,l})=>`<article class="area-card"><div class="area-order">${a.floor}</div><div><p class="eyebrow">PISO ${a.floor} · ${escapeHtml(a.code)}</p><h3>${escapeHtml(a.name)}</h3><span class="area-meta">${escapeHtml(l.note||'Sin observación')}${l.reschedule_time?' · Retomar '+l.reschedule_time.slice(0,5):''}</span></div><button class="state-pill ${statusClass(l.status)}" onclick="openStatus('${a.id}')">${l.status}</button></article>`).join('')||'<div class="panel" style="padding:20px">No hay pendientes registrados hoy.</div>'}
function reportStartIso(dateStr) {
  return dateStr
    ? new Date(`${dateStr}T00:00:00.000-06:00`).toISOString()
    : null;
}

function reportEndIso(dateStr) {
  return dateStr
    ? new Date(`${dateStr}T23:59:59.999-06:00`).toISOString()
    : null;
}

async function loadReports() {
  const from = $('#dateFrom').value;
  const to = $('#dateTo').value;
  const f = $('#reportFloor').value;

  let q = sb
    .from('crl_cleaning_logs')
    .select('*,crl_areas(name,code,floor,area_type),crl_profiles(full_name)')
    .order('recorded_at', { ascending: false })
    .limit(5000);

  if (from) {
    q = q.gte('recorded_at', reportStartIso(from));
  }

  if (to) {
    q = q.lte('recorded_at', reportEndIso(to));
  }

  const { data, error } = await q;

  if (error) {
    console.error(error);
    return toast('No se pudo cargar el reporte');
  }

  const rows = (data || []).filter(
    r => !f || String(r.crl_areas?.floor) === f
  );

  renderReports(rows);
}
function renderReports(rows){const clean=rows.filter(x=>x.status==='Limpio').length,pend=rows.length-clean,rate=rows.length?Math.round(clean/rows.length*100):0;$('#kpis').innerHTML=[['Cumplimiento',rate+'%','registros limpios'],['Registros',rows.length,'movimientos'],['Limpios',clean,'completados'],['Pendientes',pend,'otros estados']].map(x=>`<article class="metric-card"><span class="label">${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');$('#reportBody').innerHTML=rows.map(l=>{const d=new Date(l.recorded_at);return `<tr><td>${d.toLocaleDateString('es-CR')}</td><td>${d.toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit'})}</td><td>${l.crl_areas?.floor??''}</td><td>${escapeHtml(l.crl_areas?.name||'')}</td><td><span class="state-pill ${statusClass(l.status)}">${l.status}</span></td><td>${escapeHtml(l.crl_profiles?.full_name||session.user.email)}</td><td>${escapeHtml(l.note||'')}</td></tr>`}).join('');window.reportRows=rows}
async function exportXlsx(){
  const rows=window.reportRows||[];
  if(!rows.length)return toast('No hay registros para exportar');
  if(typeof ExcelJS==='undefined')return toast('No se pudo cargar el generador de Excel');
  setBusy(true);
  try{
    const wb=new ExcelJS.Workbook();
    wb.creator='LillyTech';wb.lastModifiedBy=profile?.full_name||'LillyTech';wb.created=new Date();
    wb.modified=new Date();wb.title='Reporte de recorridos de limpieza';wb.subject='Cumplimiento y detalle de limpieza';
    const navy='17324D',blue='2F6690',lightBlue='EAF2F8',ice='F5F8FB',white='FFFFFF',text='263238',muted='607D8B',amber='D99A2B',red='B54747',gray='D9E2EA';
    const thin={style:'thin',color:{argb:gray}};
    const clean=rows.filter(r=>r.status==='Limpio').length;
    const occupied=rows.filter(r=>r.status==='Área ocupada').length;
    const rescheduled=rows.filter(r=>r.status==='Reprogramado').length;
    const attention=rows.filter(r=>r.status==='Requiere atención').length;
    const pending=rows.length-clean;
    const rate=rows.length?clean/rows.length:0;
    const dateFrom=$('#dateFrom').value||'';const dateTo=$('#dateTo').value||'';const floorFilter=$('#reportFloor').value||'Todos';
    const dates=rows.map(r=>new Date(r.recorded_at)).sort((a,b)=>a-b);
    const period=dateFrom||dateTo?`${dateFrom||'Inicio'} al ${dateTo||'Hoy'}`:`${dates[0].toLocaleDateString('es-CR')} al ${dates.at(-1).toLocaleDateString('es-CR')}`;

    const dash=wb.addWorksheet('Dashboard',{views:[{showGridLines:false}]});
    dash.columns=[{width:4},{width:22},{width:16},{width:16},{width:16},{width:16},{width:4}];
    dash.mergeCells('B2:F3');const title=dash.getCell('B2');title.value='EMERSON CLEANING CONTROL';title.font={bold:true,size:20,color:{argb:white}};title.alignment={vertical:'middle',horizontal:'left'};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};
    dash.mergeCells('B4:F4');dash.getCell('B4').value=`Reporte del período: ${period}  |  Piso: ${floorFilter}`;dash.getCell('B4').font={size:11,color:{argb:white}};dash.getCell('B4').fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};dash.getCell('B4').alignment={vertical:'middle'};
    dash.getRow(2).height=28;dash.getRow(3).height=16;dash.getRow(4).height=22;
    const kpis=[['B6','Cumplimiento',rate,'0%'],['C6','Registros',rows.length,'0'],['D6','Limpios',clean,'0'],['E6','Pendientes',pending,'0'],['F6','Áreas ocupadas',occupied,'0']];
    for(const [cell,label,value,fmt] of kpis){const c=dash.getCell(cell);c.value=label;c.font={bold:true,size:10,color:{argb:muted}};c.alignment={horizontal:'center'};const v=dash.getCell(cell.replace('6','7'));v.value=value;v.numFmt=fmt;v.font={bold:true,size:20,color:{argb:navy}};v.alignment={horizontal:'center'};for(const r of [6,7,8]){const x=dash.getCell(`${cell[0]}${r}`);x.fill={type:'pattern',pattern:'solid',fgColor:{argb:ice}};x.border={top:thin,left:thin,bottom:thin,right:thin}}dash.getCell(cell.replace('6','8')).value=label==='Cumplimiento'?'del total filtrado':label==='Registros'?'movimientos registrados':'estado del período';dash.getCell(cell.replace('6','8')).font={size:9,color:{argb:muted}};dash.getCell(cell.replace('6','8')).alignment={horizontal:'center'}}
    dash.getRow(7).height=30;
    dash.mergeCells('B10:F10');dash.getCell('B10').value='RESUMEN POR PISO';dash.getCell('B10').font={bold:true,size:12,color:{argb:white}};dash.getCell('B10').fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};
    const floorRows=[...new Set(rows.map(r=>r.crl_areas?.floor).filter(Boolean))].sort((a,b)=>a-b).map(f=>{const a=rows.filter(r=>r.crl_areas?.floor===f),c=a.filter(r=>r.status==='Limpio').length,o=a.filter(r=>r.status==='Área ocupada').length,re=a.filter(r=>r.status==='Reprogramado').length,at=a.filter(r=>r.status==='Requiere atención').length;return [f,a.length,c,o,re,at,a.length?c/a.length:0]});
    const fh=['Piso','Registros','Limpios','Ocupadas','Reprogramadas','Atención','Cumplimiento'];
    dash.addRow([]);const headerRow=dash.addRow(['',...fh]);headerRow.eachCell((c,col)=>{if(col>1){c.font={bold:true,color:{argb:white}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};c.alignment={horizontal:'center'};c.border={top:thin,left:thin,bottom:thin,right:thin}}});
    floorRows.forEach(r=>{
      const row=dash.addRow(['',...r]);
      row.eachCell((c,col)=>{
        if(col>1){
          c.border={top:thin,left:thin,bottom:thin,right:thin};
          c.fill={type:'pattern',pattern:'solid',fgColor:{argb:col%2?white:ice}};
          c.alignment={horizontal:col===2?'left':'center'};
        }
      });
      row.getCell(8).numFmt='0%';
    });
    const chartStart=13+floorRows.length+2;dash.mergeCells(`B${chartStart}:F${chartStart}`);dash.getCell(`B${chartStart}`).value='DISTRIBUCIÓN DE ESTADOS';dash.getCell(`B${chartStart}`).font={bold:true,size:12,color:{argb:white}};dash.getCell(`B${chartStart}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};
    const states=[['Limpio',clean],['Área ocupada',occupied],['Reprogramado',rescheduled],['Requiere atención',attention]];
    states.forEach((s,i)=>{const rr=chartStart+1+i;dash.getCell(`B${rr}`).value=s[0];dash.getCell(`C${rr}`).value=s[1];dash.getCell(`D${rr}`).value=rows.length?s[1]/rows.length:0;dash.getCell(`D${rr}`).numFmt='0%';dash.mergeCells(`E${rr}:F${rr}`);dash.getCell(`E${rr}`).value='█'.repeat(Math.round((rows.length?s[1]/rows.length:0)*20));dash.getCell(`E${rr}`).font={color:{argb:s[0]==='Limpio'?blue:s[0]==='Requiere atención'?red:amber}};['B','C','D','E','F'].forEach(col=>dash.getCell(`${col}${rr}`).border={top:thin,left:thin,bottom:thin,right:thin})});
    dash.mergeCells(`B${chartStart+7}:F${chartStart+8}`);dash.getCell(`B${chartStart+7}`).value='Nota: el cumplimiento se calcula con base en los registros marcados como “Limpio” dentro de los filtros seleccionados. El detalle completo se encuentra en la hoja “Detalle”.';dash.getCell(`B${chartStart+7}`).alignment={wrapText:true,vertical:'middle'};dash.getCell(`B${chartStart+7}`).font={italic:true,size:9,color:{argb:muted}};dash.getCell(`B${chartStart+7}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:lightBlue}};

    const detail=wb.addWorksheet('Detalle',{views:[{state:'frozen',ySplit:1}]});
    detail.columns=[{header:'Fecha',key:'fecha',width:13},{header:'Hora',key:'hora',width:10},{header:'Piso',key:'piso',width:9},{header:'Código',key:'codigo',width:18},{header:'Área',key:'area',width:34},{header:'Tipo',key:'tipo',width:22},{header:'Estado',key:'estado',width:22},{header:'Responsable',key:'responsable',width:24},{header:'Observación',key:'observacion',width:45},{header:'Reprogramado para',key:'reprogramado',width:20}];
    detail.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:white}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};c.alignment={horizontal:'center',vertical:'middle'};c.border={top:thin,left:thin,bottom:thin,right:thin}});detail.getRow(1).height=24;
    rows.slice().sort((a,b)=>new Date(a.recorded_at)-new Date(b.recorded_at)).forEach(l=>{const d=new Date(l.recorded_at);detail.addRow({fecha:d,hora:d,codigo:l.crl_areas?.code||'',piso:l.crl_areas?.floor||'',area:l.crl_areas?.name||'',tipo:l.crl_areas?.area_type||'',estado:l.status,responsable:l.crl_profiles?.full_name||session.user.email,observacion:l.note||'',reprogramado:l.reschedule_time?String(l.reschedule_time).slice(0,5):''})});
    detail.getColumn('fecha').numFmt='dd/mm/yyyy';detail.getColumn('hora').numFmt='hh:mm';detail.autoFilter='A1:J1';
    detail.eachRow((row,n)=>{if(n>1){row.alignment={vertical:'top',wrapText:true};row.eachCell(c=>{c.border={top:thin,left:thin,bottom:thin,right:thin};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:n%2===0?white:ice}}});const st=row.getCell(7);if(st.value==='Limpio')st.font={color:{argb:blue},bold:true};else if(st.value==='Requiere atención')st.font={color:{argb:red},bold:true};else st.font={color:{argb:amber},bold:true}}});

    const pendSheet=wb.addWorksheet('Pendientes y observaciones',{views:[{state:'frozen',ySplit:1}]});
    pendSheet.columns=[{header:'Fecha',key:'fecha',width:13},{header:'Hora',key:'hora',width:10},{header:'Piso',key:'piso',width:9},{header:'Área',key:'area',width:34},{header:'Estado',key:'estado',width:22},{header:'Responsable',key:'responsable',width:24},{header:'Observación',key:'observacion',width:48},{header:'Retomar',key:'retomar',width:14}];
    pendSheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:white}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};c.alignment={horizontal:'center'};c.border={top:thin,left:thin,bottom:thin,right:thin}});
    rows.filter(r=>r.status!=='Limpio'||r.note).forEach(l=>{const d=new Date(l.recorded_at);pendSheet.addRow({fecha:d,hora:d,piso:l.crl_areas?.floor||'',area:l.crl_areas?.name||'',estado:l.status,responsable:l.crl_profiles?.full_name||session.user.email,observacion:l.note||'',retomar:l.reschedule_time?String(l.reschedule_time).slice(0,5):''})});
    pendSheet.getColumn('fecha').numFmt='dd/mm/yyyy';pendSheet.getColumn('hora').numFmt='hh:mm';pendSheet.autoFilter='A1:H1';pendSheet.eachRow((row,n)=>{if(n>1){row.alignment={vertical:'top',wrapText:true};row.eachCell(c=>{c.border={top:thin,left:thin,bottom:thin,right:thin};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:n%2===0?white:ice}}})}});

    const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Emerson_Cleaning_Control_${dateFrom||today()}_${dateTo||today()}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Reporte XLSX generado');
  }catch(e){console.error(e);toast('No se pudo generar el reporte XLSX')}finally{setBusy(false)}
}
function renderAreasAdmin(){if(!isManager())return;const f=$('#areaFloorFilter').value,q=$('#areaSearch').value.toLowerCase();const arr=areas.filter(a=>(!f||String(a.floor)===f)&&(!q||[a.name,a.code,a.type].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.floor-b.floor||a.order-b.order);$('#areasBody').innerHTML=arr.map(a=>`<tr><td>${a.order}</td><td>${a.floor}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.code)}</td><td>${escapeHtml(a.type)}</td><td><span class="state-pill ${a.active?'s-clean':'s-pending'}">${a.active?'Activa':'Inactiva'}</span></td><td><div class="actions"><button class="action-btn" onclick="openAreaEditor('${a.id}')">Editar</button><button class="action-btn" onclick="deleteArea('${a.id}')">Eliminar</button></div></td></tr>`).join('')}
window.openAreaEditor=function(id){const a=id?areas.find(x=>x.id===id):null;$('#areaDialogTitle').textContent=a?'Editar área':'Agregar área';$('#editAreaId').value=a?.id||'';$('#editFloor').value=a?.floor||1;$('#editOrder').value=a?.order||(areas.filter(x=>x.floor===1).length+1);$('#editName').value=a?.name||'';$('#editCode').value=a?.code||'';$('#editType').value=a?.type||'';$('#editNotes').value=a?.notes||'';$('#editActive').checked=a?.active??true;$('#areaDialog').showModal()}
async function saveArea(){const id=$('#editAreaId').value,payload={floor:+$('#editFloor').value,display_order:+$('#editOrder').value,name:$('#editName').value.trim(),code:$('#editCode').value.trim(),area_type:$('#editType').value.trim(),notes:$('#editNotes').value.trim(),active:$('#editActive').checked,updated_at:new Date().toISOString()};if(!payload.name||!payload.code||!payload.area_type)return toast('Completa los datos requeridos');setBusy(true);const r=id?await sb.from('crl_areas').update(payload).eq('id',id):await sb.from('crl_areas').insert(payload);setBusy(false);if(r.error)return toast(r.error.code==='23505'?'El código ya existe':'No se pudo guardar');await loadAreas();$('#areaDialog').close();renderAreasAdmin();renderAll();toast('Área guardada')}
window.deleteArea=async function(id){if(!confirm('¿Eliminar esta área? Si tiene historial, se desactivará.'))return;setBusy(true);const {error}=await sb.from('crl_areas').delete().eq('id',id);if(error?.code==='23503'){await sb.from('crl_areas').update({active:false,updated_at:new Date().toISOString()}).eq('id',id);toast('El área tiene historial y fue desactivada')}else if(error)toast('No se pudo eliminar');else toast('Área eliminada');setBusy(false);await loadAreas();renderAreasAdmin();renderAll()}
boot().catch(e=>{console.error(e);$('#loginError').textContent='Ocurrió un error al iniciar la aplicación.'});
