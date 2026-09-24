/* 07-reports-b.js -- The rest of the print/export reports, plus the Marketing tab (campaigns list, campaign detail, group-text sending, response tracking).
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

function printRoundsLastCleaned(){
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  if(!roundNames.length){
    runPrint('Round Cleaning Dates', '<div class="rpt-empty-note">No rounds yet.</div>', false, false, () => openReports());
    return;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 35);
  const cutoffISO = cutoff.toISOString().slice(0,10);

  const rows = roundNames.map(rn=>{
    const custs = rounds[rn];
    const dateSet = new Set();
    let latestOverall = null;
    custs.forEach(c=>{
      (c.cleanHistory||[]).forEach(e=>{
        if(!e.date) return;
        if(e.date >= cutoffISO) dateSet.add(e.date);
        if(!latestOverall || e.date > latestOverall) latestOverall = e.date;
      });
    });
    const sortedDates = Array.from(dateSet).sort().reverse();
    const datesCell = sortedDates.length
      ? sortedDates.map(d=>fmtDate(d)).join(', ')
      : `<span style="color:#66798A;">None in the last 5 weeks${latestOverall ? ' · last cleaned ' + fmtDate(latestOverall) : ' · never cleaned'}</span>`;
    return `<tr>
      <td>${escapeHtml(rn)}</td>
      <td>${datesCell}</td>
    </tr>`;
  }).join('');
  const body = `<table class="rpt-table rpt-table-as-tabs"><thead><tr><th>Round</th><th>Dates cleaned (last 5 weeks)</th></tr></thead><tbody>${rows}</tbody></table>`;
  runPrint('Round Cleaning Dates', body, false, false, () => openReports());
}

function printRoundsLastCleanedCalendar(){
  if(!data.customers.length){
    runPrint('Round Cleaning Dates — Calendar', '<div class="rpt-empty-note">No rounds yet.</div>', false, false, () => openReports());
    return;
  }
  const today = new Date();
  today.setHours(0,0,0,0);
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 34); // 35-day (5-week) window including today

  const rsDow = rangeStart.getDay();
  const rsDiffToMonday = (rsDow === 0) ? 6 : rsDow - 1;
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - rsDiffToMonday);

  const cleanedByDate = {};
  data.customers.forEach(c=>{
    (c.cleanHistory||[]).forEach(e=>{
      if(!e.date) return;
      if(!cleanedByDate[e.date]) cleanedByDate[e.date] = new Set();
      cleanedByDate[e.date].add(c.round || 'Unassigned');
    });
  });

  const totalWeeks = Math.ceil((Math.round((today - gridStart) / 86400000) + 1) / 7);
  let bodyRows = '';
  for(let w=0; w<totalWeeks; w++){
    bodyRows += '<tr>';
    for(let d=0; d<7; d++){
      const cellDate = new Date(gridStart);
      cellDate.setDate(cellDate.getDate() + w*7 + d);
      const iso = cellDate.toISOString().slice(0,10);
      const outside = cellDate < rangeStart || cellDate > today;
      const roundsCleaned = cleanedByDate[iso] ? Array.from(cleanedByDate[iso]).sort((a,b)=>a.localeCompare(b)) : [];
      const dayNum = cellDate.getDate();
      const monthLabel = (dayNum === 1) ? cellDate.toLocaleDateString('en-GB',{month:'short'}) + ' ' : '';
      bodyRows += `<td class="${outside?'outside':''}">
        <div class="daynum">${monthLabel}${dayNum}</div>
        ${roundsCleaned.map(rn=>`<span class="round-chip" style="background:#E2F5EA; color:#1F7A46;">${escapeHtml(rn)}</span>`).join('')}
      </td>`;
    }
    bodyRows += '</tr>';
  }

  const body = `
    <table class="rpt-calendar">
      <thead><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Shows any round with a customer cleaned on that day. Greyed-out days fall outside the last 5 weeks.</p>
  `;
  runPrint('Round Cleaning Dates — Calendar', body, false, false, () => openReports());
}

function printWindowsDue(){
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  let body = '';
  let anyRoundShown = false;
  roundNames.forEach((rn)=>{
    const custs = rounds[rn].filter(c=>{
      const s = custStatus(c);
      return !c.paused && s.cleanBadge && s.cleanBadge.type==='due';
    }).sort((a,b)=>{
      const daysDueOf = x => { const lc = lastDateOf(x.cleanHistory); return lc ? daysBetween(lc, todayISO()) : 0; };
      return daysDueOf(b) - daysDueOf(a);
    });
    if(!custs.length) return;
    body += `<div class="rpt-round-title${anyRoundShown?' rpt-page-break':''}">${escapeHtml(rn)}</div>`;
    anyRoundShown = true;
    const rows = custs.map(c=>{
      const s = custStatus(c);
      return `<tr>
        <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
        <td>${fmtDate(s.lastClean)}</td>
        <td>${fmtDate(nextDueISO(c))}</td>
        <td class="rpt-flag due">${escapeHtml(s.cleanBadge.text)}</td>
      </tr>`;
    }).join('');
    body += `<table class="rpt-table"><thead><tr><th>Customer</th><th>Last cleaned</th><th>Next due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  });
  if(!anyRoundShown) body = '<div class="rpt-empty-note">Nobody\'s due a clean right now.</div>';
  runPrint('Windows Due, by Round', body, false, false, () => openRoundReports());
}

function printMoneyOwed(){
  const owedCusts = data.customers.filter(c=>custStatus(c).owed);
  const rounds = groupByRound(owedCusts);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  let total = 0;
  let rows = '';
  roundNames.forEach(rn=>{
    const custs = rounds[rn].slice().sort((a,b)=>custStatus(b).balance-custStatus(a).balance);
    custs.forEach(c=>{
      const s = custStatus(c);
      total += s.balance;
      rows += `<tr>
        <td style="font-weight:700;">${escapeHtml(rn)}</td>
        <td>${escapeHtml(c.address||'')}${(c.name||c.phone)?`<br><span style="color:#66798A">${[escapeHtml(c.name||''), c.phone?escapeHtml(c.phone):''].filter(Boolean).join(' · ')}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
        <td>${fmtDate(s.lastPaid)}</td>
        <td class="rpt-flag overdue" style="text-align:right;">${money(s.balance)}</td>
      </tr>`;
    });
  });
  let body;
  if(!rows){
    body = '<div class="rpt-empty-note">Nobody currently owes money — everyone is paid up.</div>';
  } else {
    body = `<table class="rpt-table"><thead><tr><th>Round</th><th>Customer</th><th>Last paid</th><th style="text-align:right;">Owed</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:12px; font-size:16px;">Total outstanding: ${money(total)}</div>`;
  }
  runPrint('Money Owed', body, false, false, () => openRoundReports());
}

function printFullRounds(){
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  let body = '';
  let grandTotal = 0;
  let grandCount = 0;
  roundNames.forEach((rn, idx)=>{
    body += `<div class="rpt-round-title${idx>0?' rpt-page-break':''}">${escapeHtml(rn)}</div>`;
    const custs = sortByRoute(rounds[rn]);
    const spansMultipleDays = roundDaysUsed(custs).length > 1;
    let roundTotal = 0;
    const rows = custs.map(c=>{
      roundTotal += Number(c.price||0);
      return `<tr>
        <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
        ${spansMultipleDays ? `<td>Day ${c.visitDay||1}</td>` : ''}
        <td>${escapeHtml(c.phone||'')}${c.phone&&c.email?'<br>':''}${escapeHtml(c.email||'')}</td>
        <td>${money(c.price)}</td>
        <td>Every ${c.frequencyWeeks||4}wk</td>
      </tr>`;
    }).join('');
    grandTotal += roundTotal;
    grandCount += custs.length;
    const roundAvg = custs.length ? roundTotal/custs.length : 0;
    body += `<table class="rpt-table"><thead><tr><th>Customer</th>${spansMultipleDays ? '<th>Day</th>' : ''}<th>Contact</th><th>Price</th><th>Frequency</th></tr></thead><tbody>${rows}</tbody></table>`;
    body += `<div class="rpt-total">${custs.length} customer${custs.length===1?'':'s'} · Round total: ${money(roundTotal)} · Avg: ${money(roundAvg)}</div>`;
  });
  if(!roundNames.length){
    body = '<div class="rpt-empty-note">No customers added yet.</div>';
  } else {
    const grandAvg = grandCount ? grandTotal/grandCount : 0;
    body += `<div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:16px; font-size:16px;">Grand total (all rounds): ${grandCount} customers · ${money(grandTotal)} · Avg: ${money(grandAvg)}</div>`;
  }
  runPrint('Full Round Lists', body, false, false, () => openRoundReports());
}

function printSingleRound(roundName){
  const rounds = groupByRound(data.customers);
  const custs = sortByRoute(rounds[roundName] || []);
  if(!custs.length){ toast('No customers in this round yet'); return; }
  const spansMultipleDays = roundDaysUsed(custs).length > 1;
  let roundTotal = 0;
  let activeCount = 0;
  const rows = custs.map(c=>{
    if(!c.paused){ roundTotal += Number(c.price||0); activeCount++; }
    const s = custStatus(c);
    return `<tr>
      <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
      ${spansMultipleDays ? `<td>Day ${c.visitDay||1}</td>` : ''}
      <td>${escapeHtml(c.phone||'')}${c.phone&&c.email?'<br>':''}${escapeHtml(c.email||'')}</td>
      <td>${money(c.price)}</td>
      <td>Every ${c.frequencyWeeks||4}wk</td>
      <td>${c.paused ? `Paused${c.pauseReason?' — '+escapeHtml(c.pauseReason):''}${c.pauseDate?' ('+fmtDate(c.pauseDate)+')':''}` : (s.owed ? 'Owes '+money(s.balance) : 'OK')}</td>
    </tr>`;
  }).join('');
  const roundAvg = activeCount ? roundTotal / activeCount : 0;
  const body = `
    <table class="rpt-table"><thead><tr><th>Customer</th>${spansMultipleDays ? '<th>Day</th>' : ''}<th>Contact</th><th>Price</th><th>Frequency</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:16px; font-size:16px;">${custs.length} customer${custs.length===1?'':'s'} · Round total: ${money(roundTotal)} · Avg: ${money(roundAvg)}</div>
  `;
  runPrint(roundName, body, false, false, () => openRoundActionsMenu(roundName));
}

function printCustomerRecord(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const s = custStatus(c);

  const infoRows = [
    c.name ? ['Name', escapeHtml(c.name)] : null,
    c.accountNumber ? ['Account no.', escapeHtml(c.accountNumber)] : null,
    ['Round', escapeHtml(c.round||'Unassigned')],
    ['Price', `${money(c.price)} · every ${c.frequencyWeeks||4} week${(c.frequencyWeeks||4)===1?'':'s'}`],
    c.phone ? ['Phone', escapeHtml(c.phone)] : null,
    c.email ? ['Email', escapeHtml(c.email)] : null,
    propertySummaryText(c) ? ['Property', escapeHtml(propertySummaryText(c))] : null,
    ['Status', c.paused ? `Paused${c.pauseReason?' — '+escapeHtml(c.pauseReason):''}${c.pauseDate?' since '+fmtDate(c.pauseDate):''}` : 'Active']
  ].filter(Boolean).map(([label,val])=>`<tr><td style="font-weight:700; width:110px;">${label}</td><td>${val}</td></tr>`).join('');

  const cleanRows = (c.cleanHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1)
    .map(e=>`<tr><td>${fmtDate(e.date)}</td><td style="text-align:right;">${money(e.amount)}</td></tr>`).join('')
    || '<tr><td colspan="2" style="color:#66798A;">No cleans logged yet</td></tr>';
  const payRows = (c.paymentHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1)
    .map(p=>`<tr><td>${fmtDate(p.date)}</td><td style="text-align:right;">${money(p.amount)}</td></tr>`).join('')
    || '<tr><td colspan="2" style="color:#66798A;">No payments logged yet</td></tr>';

  const balanceText = s.owed ? `Owes ${money(s.balance)}` : s.credit ? `In credit: ${money(Math.abs(s.balance))}` : 'Fully paid up';

  const photosHtml = (c.photos && c.photos.length) ? `
    <div class="rpt-round-title">Photos</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      ${c.photos.map(p=>`<img src="${photoUrlCache.get(p.id) || p.dataUrl || ''}" style="width:160px; height:160px; object-fit:cover; border-radius:6px; border:1px solid #E3E9EC;">`).join('')}
    </div>
  ` : '';

  const body = `
    <table class="rpt-table" style="margin-bottom:16px;"><tbody>${infoRows}</tbody></table>
    ${c.notes ? `<div style="background:#F5F7F8; border:1px solid #E3E9EC; border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:16px;">${escapeHtml(c.notes)}</div>` : ''}
    <div class="rpt-total" style="text-align:left; font-size:15px; margin-bottom:16px;">Balance: ${balanceText}</div>
    <div class="rpt-round-title" style="margin-top:0;">Clean history</div>
    <table class="rpt-table"><thead><tr><th>Date</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${cleanRows}</tbody></table>
    <div class="rpt-round-title">Payment history</div>
    <table class="rpt-table"><thead><tr><th>Date</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${payRows}</tbody></table>
    ${photosHtml}
  `;
  runPrint(c.address || c.name || 'Customer Record', body, false, false, () => openCustomerDetail(id));
}

function printJobInvoice(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  if(!j) return;
  const linkedCustomer = j.customerId ? data.customers.find(x=>x.id===j.customerId) : null;
  const invoiceNumber = 'INV-' + (j.date||todayISO()).replace(/-/g,'') + '-' + j.id.slice(-4).toUpperCase();
  const company = data.settings.companyName || '';
  const companyAddress = data.settings.companyAddress || '';
  const companyPhone = data.settings.companyPhone || '';
  const yourName = data.settings.yourName || '';
  const hasLogo = !!data.settings.logo;
  const fromLine = [yourName, company].filter(Boolean).join(' · ');

  const metaRows = [
    ['Invoice number', invoiceNumber],
    ['Invoice date', fmtDate(todayISO())],
    ['Job date', fmtDate(j.date)],
    ['Status', j.paid ? 'Paid' : 'Payment due']
  ].map(([label,val])=>`<tr><td style="font-weight:700; width:140px; color:#66798A;">${label}</td><td>${escapeHtml(String(val))}</td></tr>`).join('');

  const billToLines = [
    j.name ? escapeHtml(j.name) : '',
    j.address ? escapeHtml(j.address) : '',
    j.phone ? escapeHtml(j.phone) : '',
    linkedCustomer && linkedCustomer.accountNumber ? `Account: ${escapeHtml(linkedCustomer.accountNumber)}` : ''
  ].filter(Boolean).map(l=>`<div>${l}</div>`).join('');

  const description = j.notes ? escapeHtml(j.notes) : 'Window cleaning — one-off job';
  const discountPct = Math.max(0, Math.min(100, Number(j.discountPercent||0)));
  const total = jobDiscountedTotal(j);

  // Logo (its own top-level block, so the docx exporter's image branch picks it up cleanly)
  // and the company name / address / phone (separate top-level blocks, left-aligned, so they
  // fall through to the exporter's plain-paragraph handling) are kept as siblings rather than
  // nested inside one div — a div mixing an <img> with text would have its text silently
  // dropped by the exporter, which only pulls images out of an image-bearing node.
  const logoBlock = hasLogo
    ? `<div style="text-align:left; margin-bottom:4px;"><img class="inv-logo" src="${data.settings.logo}" style="display:block; max-height:60px; max-width:200px; object-fit:contain;"></div>`
    : '';
  const nameBlock = (!hasLogo && company)
    ? `<div style="text-align:left; font-size:15px; font-weight:800; color:#10344C; margin-bottom:2px;">${escapeHtml(company)}</div>`
    : '';
  const addressBlock = companyAddress
    ? `<div style="text-align:left; font-size:11px; color:#66798A; line-height:1.5;">${escapeHtml(companyAddress).replace(/\n/g,'<br>')}</div>`
    : '';
  const phoneBlock = companyPhone
    ? `<div style="text-align:left; font-size:11px; color:#66798A; line-height:1.5;">${escapeHtml(companyPhone)}</div>`
    : '';
  const letterheadSpacer = (logoBlock || nameBlock || addressBlock || phoneBlock)
    ? `<div style="margin-bottom:16px;"></div>` : '';

  const body = `
    ${logoBlock}${nameBlock}${addressBlock}${phoneBlock}${letterheadSpacer}
    <div class="rpt-round-title" style="margin-top:0;">Invoice</div>
    <table class="rpt-table inv-meta-table" style="margin-bottom:20px;"><tbody>${metaRows}</tbody></table>

    <div class="rpt-round-title">Bill to</div>
    <div class="inv-billto">
      <span class="inv-label">Customer</span>
      ${billToLines || '<div style="color:#66798A;">No customer details on file</div>'}
    </div>

    <div class="rpt-round-title">Details</div>
    <table class="rpt-table" style="margin-bottom:4px;">
      <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>
        <tr><td>${description}</td><td style="text-align:right;">${money(j.price)}</td></tr>
        ${discountPct ? `<tr><td>Discount (${discountPct}%)</td><td style="text-align:right;">-${money(j.price - total)}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="rpt-total inv-total-box"><span>Total</span><span class="inv-total-amount">${money(total)}</span></div>
    <div style="margin-top:14px;"><span class="inv-stamp ${j.paid?'paid':'due'}">${j.paid?'✓ Paid':'Payment due'}</span></div>

    <div class="rpt-footer" style="text-align:left; border-top:none; margin-top:28px; padding-top:0;">
      Thank you for your business.${fromLine ? '<br>' + escapeHtml(fromLine) : ''}
    </div>
  `;
  // Always suppress the generic report header's company-name subtitle for invoices — the
  // letterhead block above already covers name/logo/address/phone, so showing both would
  // duplicate the company name under itself when there's no logo.
  runPrint(`Invoice — ${j.address || j.name || invoiceNumber}`, body, true, true, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)), j.phone);
}

function printJobRecord(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  if(!j) return;
  const linkedCustomer = j.customerId ? data.customers.find(x=>x.id===j.customerId) : null;
  const infoRows = [
    ['Date', fmtDate(j.date)],
    j.name ? ['Name', escapeHtml(j.name)] : null,
    j.phone ? ['Phone', escapeHtml(j.phone)] : null,
    linkedCustomer && linkedCustomer.accountNumber ? ['Account no.', escapeHtml(linkedCustomer.accountNumber)] : null,
    ['Price', money(j.price)],
    propertySummaryText(j) ? ['Property', escapeHtml(propertySummaryText(j))] : null,
    ['Done', j.done ? 'Yes' : 'No'],
    ['Paid', j.paid ? 'Yes' : 'No']
  ].filter(Boolean).map(([label,val])=>`<tr><td style="font-weight:700; width:110px;">${label}</td><td>${val}</td></tr>`).join('');
  const photosHtml = (j.photos && j.photos.length) ? `
    <div class="rpt-round-title">Photos</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px;">
      ${j.photos.map(p=>`<img src="${photoUrlCache.get(p.id) || p.dataUrl || ''}" style="width:160px; height:160px; object-fit:cover; border-radius:6px; border:1px solid #E3E9EC;">`).join('')}
    </div>
  ` : '';
  const body = `
    <table class="rpt-table" style="margin-bottom:16px;"><tbody>${infoRows}</tbody></table>
    ${j.notes ? `<div style="background:#F5F7F8; border:1px solid #E3E9EC; border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:16px;">${escapeHtml(j.notes)}</div>` : ''}
    ${photosHtml}
  `;
  runPrint(j.address || j.name || 'One-off Job', body, false, false, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)));
}

function printAllJobs(){
  const jobs = (data.oneOffJobs||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!jobs.length){
    runPrint('One-off Jobs', '<div class="rpt-empty-note">No one-off jobs added yet.</div>', false, false);
    return;
  }
  let total = 0;
  const rows = jobs.map(j=>{
    total += Number(j.price||0);
    const linkedCustomer = j.customerId ? data.customers.find(x=>x.id===j.customerId) : null;
    return `<tr>
      <td>${fmtDate(j.date)}</td>
      <td>${escapeHtml(j.address||'')}${(j.name||j.phone)?`<br><span style="color:#66798A">${[escapeHtml(j.name||''), j.phone?escapeHtml(j.phone):''].filter(Boolean).join(' · ')}</span>`:''}${linkedCustomer&&linkedCustomer.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(linkedCustomer.accountNumber)}</span>`:''}</td>
      <td style="text-align:right;">${money(j.price)}</td>
      <td class="rpt-flag ${j.done?'':'due'}">${j.done?'Done':'Not done'}</td>
      <td class="rpt-flag ${j.paid?'':'overdue'}">${j.paid?'Paid':'Unpaid'}</td>
    </tr>`;
  }).join('');
  const body = `
    <table class="rpt-table"><thead><tr><th>Date</th><th>Job</th><th style="text-align:right;">Price</th><th>Status</th><th>Payment</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:12px; font-size:16px;">Total value: ${money(total)}</div>
  `;
  runPrint('One-off Jobs', body, false, false);
}

function printQuotes(){
  const quotes = (data.quotes||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!quotes.length){
    runPrint('Quotes', '<div class="rpt-empty-note">No quotes added yet.</div>', false, false);
    return;
  }
  const statusLabel = q => q.status==='accepted' ? 'Accepted' : q.status==='declined' ? 'Declined' : q.status==='converted' ? 'Converted' : 'Pending';
  const statusClass = q => q.status==='accepted' ? '' : q.status==='declined' ? 'overdue' : q.status==='converted' ? '' : (quoteNeedsFollowUp(q, todayISO()) ? 'due' : '');
  let total = 0;
  const rows = quotes.map(q=>{
    total += Number(q.price||0);
    const followUp = quoteNeedsFollowUp(q, todayISO());
    return `<tr>
      <td>${fmtDate(q.date)}</td>
      <td>${escapeHtml(q.address||'')}${(q.name||q.phone)?`<br><span style="color:#66798A">${[escapeHtml(q.name||''), q.phone?escapeHtml(q.phone):''].filter(Boolean).join(' · ')}</span>`:''}</td>
      <td style="text-align:right;">${money(q.price)}</td>
      <td class="rpt-flag ${statusClass(q)}">${statusLabel(q)}${followUp?' — needs follow-up':''}</td>
    </tr>`;
  }).join('');
  const body = `
    <table class="rpt-table"><thead><tr><th>Date</th><th>Quote</th><th style="text-align:right;">Price</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:12px; font-size:16px;">Total quoted value: ${money(total)}</div>
  `;
  runPrint('Quotes', body, false, false);
}

function getLastPriceIncreaseDate(c){
  const hist = (c.priceHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1);
  if(!hist.length) return null;
  let lastIncrease = hist[0].date;
  for(let i=1; i<hist.length; i++){
    if(hist[i].price > hist[i-1].price) lastIncrease = hist[i].date;
  }
  return lastIncrease;
}
// Earliest recorded clean — the closest thing this app has to "customer
// since" (there's no separate signup date field), used by the upsell report
// below to judge how long someone's actually been on the books.
function earliestCleanDate(c){
  const dates = (c.cleanHistory||[]).map(e=>e.date);
  return dates.length ? [...dates].sort()[0] : null;
}

function printPriceReview(){
  const flagged = [];
  data.customers.forEach(c=>{
    const lastIncrease = getLastPriceIncreaseDate(c);
    if(!lastIncrease) return;
    const target = nextDueISO(c) || todayISO();
    const days = daysBetween(lastIncrease, target);
    if(days >= 365){
      flagged.push({ c, lastIncrease, target, days });
    }
  });
  flagged.sort((a,b)=> b.days - a.days);

  // Second table: anyone priced notably below their round's median £-per-house
  // — same >15% threshold and 4+ active-customer minimum as the "💷 Low" badge
  // on the customer card (see roundMedianPricePerHouse), so the report and the
  // badge always agree with each other.
  const belowMedian = [];
  data.customers.forEach(c=>{
    if(c.paused) return;
    const roundName = c.round || 'Unassigned';
    const activeInRound = data.customers.filter(x=>!x.paused && (x.round||'Unassigned')===roundName).length;
    if(activeInRound < 4) return;
    const median = roundMedianPricePerHouse(roundName);
    if(median == null || median <= 0) return;
    const ownPerHouse = Number(c.price||0) / houseWeight(c);
    if(ownPerHouse >= median * 0.85) return;
    const gap = (median - ownPerHouse) * houseWeight(c);
    belowMedian.push({ c, roundName, median, gap });
  });
  belowMedian.sort((a,b)=> b.gap - a.gap);

  if(!flagged.length && !belowMedian.length){
    runPrint('Price Review Due', '<div class="rpt-empty-note">Nobody is due a price review right now.</div>', false, false, () => openReports());
    return;
  }

  const rows = flagged.map(({c, lastIncrease, target})=>`<tr>
    <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
    <td>${escapeHtml(c.round||'Unassigned')}</td>
    <td style="text-align:right;">${money(c.price)}</td>
    <td>${fmtDate(lastIncrease)}</td>
    <td>${fmtDate(target)}</td>
  </tr>`).join('');
  const firstTable = flagged.length ? `
    <table class="rpt-table"><thead><tr><th>Customer</th><th>Round</th><th style="text-align:right;">Current price</th><th>Last increase</th><th>Next clean</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Shows customers where it will have been 12 months or more since their last price increase by their next scheduled clean. Customers with no price history are not included.</p>
  ` : '<div class="rpt-empty-note">Nobody is due a price review right now.</div>';

  const belowMedianRows = belowMedian.map(({c, roundName, median, gap})=>`<tr>
    <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
    <td>${escapeHtml(roundName)}</td>
    <td style="text-align:right;">${money(c.price)}</td>
    <td style="text-align:right;">${money(median)}</td>
    <td style="text-align:right;">${money(gap)}</td>
  </tr>`).join('');
  const secondTable = belowMedian.length ? `
    <div class="rpt-round-title" style="margin-top:22px;">Priced below round average</div>
    <table class="rpt-table"><thead><tr><th>Customer</th><th>Round</th><th style="text-align:right;">Current price</th><th style="text-align:right;">Round median (per house)</th><th style="text-align:right;">Gap</th></tr></thead><tbody>${belowMedianRows}</tbody></table>
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Customers priced 15%+ below their round's median price per house. Rounds with fewer than 4 active customers aren't included, since a small round's median isn't meaningful. Gap is house-weighted (see fronts-only pricing) and sorted biggest first.</p>
  ` : '';

  const body = firstTable + secondTable;
  runPrint('Price Review Due', body, false, false, () => openReports());
}

function printUpsellOpportunities(){
  // Flat, easy-to-tweak uplift figures per reason. frontsToBacks is a fraction
  // of the customer's current price (a full clean scales with house size, so a
  // flat figure wouldn't make sense there); the rest are one-off flat prices
  // for a specific add-on job.
  const UPLIFT = {
    frontsToBacks: 0.5,
    conservatoryRoof: 20,
    garageDoor: 10,
    gutters: 60
  };
  const today = todayISO();
  // Paused customers are left out — no point suggesting an upsell to someone
  // who's stopped the service, matching how other reports (e.g. property
  // types) already treat paused customers as inactive.
  const opportunities = [];
  data.customers.forEach(c=>{
    if(c.paused) return;
    const firstClean = earliestCleanDate(c);
    let reason = null, uplift = 0;
    // Checked in this order, first match wins — each customer gets one
    // suggestion, not a stack of every add-on they happen to be missing.
    if(c.frontsOnly && firstClean && daysBetween(firstClean, today) >= 90){
      reason = 'Fronts-only — backs could add ~50% of price';
      uplift = Number(c.price||0) * UPLIFT.frontsToBacks;
    } else if(c.addOnConservatory && !/roof/i.test(c.addOnOther||'')){
      reason = 'Conservatory roof clean';
      uplift = UPLIFT.conservatoryRoof;
    } else if((c.propertyType === 'Detached' || c.propertyType === 'Semi-detached') && !c.addOnGarageDoor){
      reason = 'Garage door clean';
      uplift = UPLIFT.garageDoor;
    } else if(!c.addOnConservatory && !c.addOnExtension && !c.addOnGarageDoor && !c.addOnOther && firstClean && daysBetween(firstClean, today) >= 182){
      reason = 'Gutter/fascia upsell';
      uplift = UPLIFT.gutters;
    }
    if(reason) opportunities.push({ c, reason, uplift });
  });
  opportunities.sort((a,b)=> b.uplift - a.uplift);

  if(!opportunities.length){
    runPrint('Upsell Opportunities', '<div class="rpt-empty-note">No upsell opportunities spotted right now.</div>', false, false, () => openReports());
    return;
  }

  const rows = opportunities.map(({c, reason, uplift})=>`<tr>
    <td>${escapeHtml(c.address||'')}${c.name?`<br><span style="color:#66798A">${escapeHtml(c.name)}</span>`:''}${c.accountNumber?`<br><span style="color:#66798A">Acct #${escapeHtml(c.accountNumber)}</span>`:''}</td>
    <td>${escapeHtml(c.round||'Unassigned')}</td>
    <td>${escapeHtml(reason)}</td>
    <td style="text-align:right;">${money(uplift)}</td>
  </tr>`).join('');
  const totalUplift = opportunities.reduce((sum,o)=>sum+o.uplift, 0);
  const body = `
    <table class="rpt-table"><thead><tr><th>Customer</th><th>Round</th><th>Reason</th><th style="text-align:right;">Suggested uplift</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:12px; font-size:16px;">Total potential uplift: ${money(totalUplift)}</div>
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Each customer shows one suggestion only — the first that applies, checked in order: fronts-only long enough that backs are worth offering, a conservatory with no roof clean mentioned, a detached/semi-detached house with no garage door clean, then anyone with no add-ons at all who's been a customer 6+ months. Uplift figures are flat estimates, not quotes — adjust to the job.</p>
  `;
  runPrint('Upsell Opportunities', body, false, false, () => openReports());
}

function printPropertyTypesReport(){
  // Paused customers are left out, matching how round counts/values are worked
  // out everywhere else (e.g. the Rounds tab, the exported summary sheet).
  const active = data.customers.filter(c=>!c.paused);
  if(!active.length){
    runPrint('Property Types Report', '<div class="rpt-empty-note">No customers recorded yet.</div>', false, false, () => openReports());
    return;
  }
  // "Not recorded" catches anyone with no property type set — since the field
  // is optional, silently dropping them would make counts add up to less than
  // the round/total customer count, which would be confusing on a report.
  const categories = [...PROPERTY_TYPES, 'Not recorded'];
  function breakdown(list){
    return categories.map(cat=>{
      const inCat = list.filter(c => (c.propertyType || 'Not recorded') === cat);
      const weight = inCat.reduce((sum,c)=>sum+houseWeight(c), 0);
      const total = inCat.reduce((sum,c)=>sum+Number(c.price||0),0);
      return { cat, weight, avg: weight ? total/weight : 0 };
    }).filter(row => row.weight > 0);
  }
  function tableHtml(list){
    const rows = breakdown(list);
    const totalWeight = list.reduce((sum,c)=>sum+houseWeight(c), 0);
    const totalValue = list.reduce((sum,c)=>sum+Number(c.price||0),0);
    const totalAvg = totalWeight ? totalValue/totalWeight : 0;
    const bodyRows = rows.map(r=>`<tr><td>${escapeHtml(r.cat)}</td><td style="text-align:right;">${formatHouseCount(r.weight)}</td><td style="text-align:right;">${money(r.avg)}</td></tr>`).join('');
    return `<table class="rpt-table"><thead><tr><th>Property type</th><th style="text-align:right;">Houses</th><th style="text-align:right;">Average price</th></tr></thead><tbody>${bodyRows}
      <tr style="font-weight:800;"><td>All</td><td style="text-align:right;">${formatHouseCount(totalWeight)}</td><td style="text-align:right;">${money(totalAvg)}</td></tr>
    </tbody></table>`;
  }

  const rounds = groupByRound(active);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  const roundSections = roundNames.map(rn =>
    `<div class="rpt-round-title">${escapeHtml(rn)}</div>${tableHtml(rounds[rn])}`
  ).join('');

  const body = `
    <div class="rpt-round-title" style="margin-top:0;">All rounds — total</div>
    ${tableHtml(active)}
    ${roundSections}
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Paused customers are not included. "Not recorded" covers customers with no property type set yet. Fronts-only properties count as 0.5 of a house.</p>
  `;
  runPrint('Property Types Report', body, false, false, () => openReports());
}

// UK tax year runs 6 April to 5 April the following year — returns the ISO
// date (YYYY-MM-DD) the current tax year started, given any date within it.
function taxYearStart(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const y = d.getFullYear();
  const aprSixThisYear = `${y}-04-06`;
  return dateStr >= aprSixThisYear ? aprSixThisYear : `${y-1}-04-06`;
}
// Monday of the week containing this date, as an ISO date — used to group
// mileage into Monday–Sunday weeks.
function mondayOfWeek(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const dayIdx = (d.getDay()+6)%7; // 0 = Monday
  d.setDate(d.getDate()-dayIdx);
  return d.toISOString().slice(0,10);
}
function printMileageReport(){
  const entries = (data.mileageLog||[])
    .filter(e=>e.start!=null && e.end!=null && e.end>=e.start)
    .map(e=>({date:e.date, miles: e.end-e.start}))
    .sort((a,b)=>a.date.localeCompare(b.date));
  if(!entries.length){
    runPrint('Mileage Report', '<div class="rpt-empty-note">No mileage logged yet — use the mileage tile on the Today tab to start.</div>', false, false, () => openReports());
    return;
  }
  const today = todayISO();
  const tyStart = taxYearStart(today);
  const tyEnd = (()=>{ const d = new Date(tyStart+'T00:00:00'); d.setFullYear(d.getFullYear()+1); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
  const tyMiles = entries.filter(e=>e.date >= tyStart).reduce((s,e)=>s+e.miles,0);

  const monthTotals = {};
  entries.forEach(e=>{ const mk = e.date.slice(0,7); monthTotals[mk] = (monthTotals[mk]||0) + e.miles; });
  const monthRows = Object.keys(monthTotals).sort((a,b)=>b.localeCompare(a)).map(mk=>{
    const label = new Date(mk+'-01T00:00:00').toLocaleDateString('en-GB', {month:'long', year:'numeric'});
    return `<tr><td>${label}</td><td style="text-align:right;">${monthTotals[mk].toFixed(1)}</td></tr>`;
  }).join('');

  const weekTotals = {};
  entries.forEach(e=>{ const wk = mondayOfWeek(e.date); weekTotals[wk] = (weekTotals[wk]||0) + e.miles; });
  const weekRows = Object.keys(weekTotals).sort((a,b)=>b.localeCompare(a)).map(wk=>{
    const end = new Date(wk+'T00:00:00'); end.setDate(end.getDate()+6);
    return `<tr><td>${fmtDate(wk)} – ${fmtDate(end.toISOString().slice(0,10))}</td><td style="text-align:right;">${weekTotals[wk].toFixed(1)}</td></tr>`;
  }).join('');

  const dailyRows = entries.slice().reverse().map(e=>`<tr><td>${fmtDate(e.date)}</td><td style="text-align:right;">${e.miles.toFixed(1)}</td></tr>`).join('');

  const body = `
    <div class="rpt-round-title" style="margin-top:0;">Tax year to date (6 Apr ${tyStart.slice(0,4)} – ${fmtDate(tyEnd)})</div>
    <table class="rpt-table"><tbody><tr style="font-weight:800;"><td>Total miles</td><td style="text-align:right;">${tyMiles.toFixed(1)}</td></tr></tbody></table>

    <div class="rpt-round-title">Monthly totals</div>
    <table class="rpt-table"><thead><tr><th>Month</th><th style="text-align:right;">Miles</th></tr></thead><tbody>${monthRows}</tbody></table>

    <div class="rpt-round-title">Weekly totals</div>
    <table class="rpt-table"><thead><tr><th>Week (Mon–Sun)</th><th style="text-align:right;">Miles</th></tr></thead><tbody>${weekRows}</tbody></table>

    <div class="rpt-round-title">Daily mileage</div>
    <table class="rpt-table"><thead><tr><th>Date</th><th style="text-align:right;">Miles</th></tr></thead><tbody>${dailyRows}</tbody></table>
  `;
  runPrint('Mileage Report', body, false, false, () => openReports());
}

function printEarnings(){
  const payments = [];
  data.customers.forEach(c=>{
    (c.paymentHistory||[]).forEach(p=>{
      payments.push({date: p.date, amount: Number(p.amount||0)});
    });
  });
  (data.oneOffJobs||[]).forEach(j=>{
    if(j.paid){
      payments.push({date: j.paidDate || j.date, amount: Number(j.price||0)});
    }
  });

  if(!payments.length){
    runPrint('Earnings Report', '<div class="rpt-empty-note">No payments recorded yet.</div>', false, false, () => openReports());
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
  const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth()-1);
  const yearAgo = new Date(now); yearAgo.setFullYear(yearAgo.getFullYear()-1);
  const sumSince = (from) => payments.filter(p=>new Date(p.date+'T00:00:00') >= from).reduce((s,p)=>s+p.amount,0);
  const allTime = payments.reduce((s,p)=>s+p.amount,0);

  const byMonth = {};
  payments.forEach(p=>{
    const key = (p.date||'').slice(0,7);
    if(!key) return;
    byMonth[key] = (byMonth[key]||0) + p.amount;
  });
  const monthKeys = Object.keys(byMonth).sort().reverse().slice(0,12);

  const body = `
    <table class="rpt-table" style="margin-bottom:20px;">
      <tbody>
        <tr><td>Last 7 days</td><td style="text-align:right; font-weight:800;">${money(sumSince(weekAgo))}</td></tr>
        <tr><td>Last 30 days</td><td style="text-align:right; font-weight:800;">${money(sumSince(monthAgo))}</td></tr>
        <tr><td>Last 12 months</td><td style="text-align:right; font-weight:800;">${money(sumSince(yearAgo))}</td></tr>
        <tr><td>All time</td><td style="text-align:right; font-weight:800;">${money(allTime)}</td></tr>
      </tbody>
    </table>
    <div class="rpt-round-title" style="margin-top:0;">By month</div>
    <table class="rpt-table">
      <thead><tr><th>Month</th><th style="text-align:right;">Total</th></tr></thead>
      <tbody>
        ${monthKeys.map(k=>{
          const d = new Date(k+'-01T00:00:00');
          const label = d.toLocaleDateString('en-GB',{month:'long', year:'numeric'});
          return `<tr><td>${label}</td><td style="text-align:right;">${money(byMonth[k])}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  runPrint('Earnings Report', body, false, false, () => openReports());
}

function printDailyWork(){
  const dailyTotals = {};
  function addToDay(dateISO, amount){
    if(!dateISO) return;
    if(!dailyTotals[dateISO]) dailyTotals[dateISO] = { total: 0, count: 0 };
    dailyTotals[dateISO].total += Number(amount || 0);
    dailyTotals[dateISO].count += 1;
  }

  data.customers.forEach(c=>{
    (c.cleanHistory||[]).forEach(e=> addToDay(e.date, e.amount));
  });
  (data.oneOffJobs||[]).forEach(j=>{
    if(j.done) addToDay(j.date, j.price);
  });

  const today = new Date();
  const rows = [];
  let grandTotal = 0;
  let grandCount = 0;
  for(let i=29; i>=0; i--){
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0,10);
    const info = dailyTotals[iso] || { total: 0, count: 0 };
    grandTotal += info.total;
    grandCount += info.count;
    rows.push(`<tr>
      <td>${fmtDate(iso)}</td>
      <td>${info.count || ''}</td>
      <td style="text-align:right; ${info.total ? 'font-weight:700;' : 'color:#66798A;'}">${info.total ? money(info.total) : '—'}</td>
    </tr>`);
  }

  const body = `
    <table class="rpt-table">
      <thead><tr><th>Date</th><th>Cleans / jobs</th><th style="text-align:right;">Value</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <div class="rpt-total" style="border-top:2px solid #10344C; padding-top:10px; margin-top:16px; font-size:16px;">
      30-day total: ${money(grandTotal)} across ${grandCount} clean${grandCount===1?'':'s'}/job${grandCount===1?'':'s'}
    </div>
  `;
  runPrint('Daily Work Done — Last 30 Days', body, false, false, () => openReports());
}

function printSchedule(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const rangeEnd = new Date(today);
  rangeEnd.setDate(rangeEnd.getDate() + 30);

  // Find the Monday on/before today so the calendar always shows full weeks
  const dow = today.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (dow === 0) ? 6 : dow - 1;
  const gridStart = new Date(today);
  gridStart.setDate(gridStart.getDate() - diffToMonday);

  // Rounds that actually span more than one visit day get a "(Day N)" suffix on their chip,
  // so a round split across several days shows up correctly on each of those days rather
  // than as one ambiguous chip. Single-day rounds are shown exactly as before.
  const roundsAll = groupByRound(data.customers);
  const multiDayRounds = new Set(Object.keys(roundsAll).filter(rn => roundDaysUsed(roundsAll[rn]).length > 1));

  // Which rounds have a customer next due on each date, within the next 30 days
  const dueByDate = {};
  data.customers.forEach(c=>{
    if(c.paused) return;
    const next = nextDueISO(c);
    if(!next) return;
    if(!dueByDate[next]) dueByDate[next] = new Set();
    const rn = c.round || 'Unassigned';
    dueByDate[next].add(multiDayRounds.has(rn) ? `${rn} (Day ${c.visitDay||1})` : rn);
  });

  // One-off jobs scheduled on each date, within the next 30 days
  const jobsByDate = {};
  (data.oneOffJobs||[]).forEach(j=>{
    if(j.done || !j.date) return;
    if(!jobsByDate[j.date]) jobsByDate[j.date] = [];
    jobsByDate[j.date].push(j);
  });

  let bodyRows = '';
  for(let w=0; w<5; w++){
    bodyRows += '<tr>';
    for(let d=0; d<7; d++){
      const cellDate = new Date(gridStart);
      cellDate.setDate(cellDate.getDate() + w*7 + d);
      const iso = cellDate.toISOString().slice(0,10);
      const outside = cellDate < today || cellDate > rangeEnd;
      const roundsDue = dueByDate[iso] ? Array.from(dueByDate[iso]).sort((a,b)=>a.localeCompare(b)) : [];
      const jobsDue = jobsByDate[iso] || [];
      const dayNum = cellDate.getDate();
      const monthLabel = (dayNum === 1) ? cellDate.toLocaleDateString('en-GB',{month:'short'}) + ' ' : '';
      bodyRows += `<td class="${outside?'outside':''}">
        <div class="daynum">${monthLabel}${dayNum}</div>
        ${roundsDue.map(rn=>`<span class="round-chip">${escapeHtml(rn)}</span>`).join('')}
        ${jobsDue.map(j=>`<span class="round-chip job-chip">🔧 ${escapeHtml(j.address||j.name||'Job')}</span>`).join('')}
      </td>`;
    }
    bodyRows += '</tr>';
  }

  const body = `
    <table class="rpt-calendar">
      <thead><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#66798A; margin-top:12px;">Blue chips show any round with a customer due for cleaning that day, based on their last clean date and frequency — rounds split across several visit days show which day is due. Amber chips (🔧) show one-off jobs scheduled that day. Greyed-out days fall outside the next 30 days. Customers not yet cleaned at all aren't included, since there's no date to schedule from.</p>
  `;
  runPrint('Monthly Schedule', body, false, false, () => openReports());
}

