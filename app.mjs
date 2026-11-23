import { populations, demos, references, fields, evaluate, overall } from './rules.mjs';
import { records, add } from './storage.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const muted = text => node('p', text, 'muted');
const action = (label, handler) => {
  const button = node('button', label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
};
const option = (select, label, value = label) => select.add(new Option(label, value));
const citation = manual => [manual.population, manual.version, manual.filename].join(' · ');
const badge = outcome => node('span', outcome, 'badge ' + outcome.toLowerCase().split(' ')[0]);
const description = pairs => {
  const list = node('dl');
  for (const [key, value] of pairs) {
    const row = node('div');
    row.append(node('dt', key), node('dd', value));
    list.append(row);
  }
  return list;
};

let manuals = [];
let events = [];
let pdfModule;
let currentReader = 0;
let storageReady = false;
const form = $('check-form');
const population = $('population');
const medicine = $('medicine');
const selectedDemo = () => demos.find(demo => demo.id === medicine.value);
const approvals = () => new Map(events.map(event => [event.fixture, event.approved ? event.reviewer : null]));
const knownManuals = new Map(references.map(({ hash, population }) => [
  hash,
  { population, version: { Adult: '03 Dec 2020', Pediatric: '27 Apr 2020', Neonatal: '14 Apr 2020' }[population] },
]));
const normalizeSearch = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const linkedReferences = () => references.flatMap(entry => {
  const manual = manuals.find(item => item.id === entry.hash && item.population === entry.population && item.pages.length >= entry.page);
  return manual ? [{ ...entry, manual }] : [];
});
for (const select of [$('filter'), population, $('import-population')]) {
  populations.forEach(item => option(select, item));
}

function route() {
  const hash = location.hash.slice(1);
  const page = ['search', 'check', 'library'].includes(hash) ? hash : 'search';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== page;
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === '#' + page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', route);
route();

async function loadPDF(bytes) {
  pdfModule ??= import('./vendor/pdf.min.mjs');
  const api = await pdfModule;
  api.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  return api.getDocument({
    data: bytes, isEvalSupported: false, enableXfa: false, cMapPacked: true,
    cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
  }).promise;
}

async function openManual(manual, page) {
  const token = ++currentReader;
  $('citation').textContent = citation(manual);
  $('reader-content').replaceChildren(muted('Loading PDF…'));
  if (!$('reader').open) $('reader').showModal();
  let documentPDF;
  try {
    documentPDF = await loadPDF(await manual.file.arrayBuffer());
    const display = async number => {
      const pdfPage = await documentPDF.getPage(number);
      const viewport = pdfPage.getViewport({ scale: 1.4 });
      const canvas = node('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute('aria-label', 'PDF page ' + number);
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (token !== currentReader) return;
      const controls = node('div', null, 'actions');
      const go = next => display(next).catch(() => {
        if (token === currentReader) $('reader-content').replaceChildren(muted('This PDF page could not be displayed.'));
      });
      const previous = action('Previous page', () => go(number - 1));
      const next = action('Next page', () => go(number + 1));
      previous.disabled = number <= 1;
      next.disabled = number >= documentPDF.numPages;
      controls.append(previous, next);
      $('reader-content').replaceChildren(muted(`Page ${number} of ${documentPDF.numPages}`), controls, canvas);
    };
    if (token !== currentReader) { await documentPDF.destroy(); return; }
    $('reader').addEventListener('close', () => { documentPDF.destroy().catch(() => {}); }, { once: true });
    await display(page);
  } catch {
    if (token === currentReader) $('reader-content').replaceChildren(muted('This PDF could not be displayed.'));
  }
}
$('close-reader').addEventListener('click', () => $('reader').close());
$('reader').addEventListener('close', () => { currentReader++; });

function renderSearch() {
  const query = normalizeSearch($('query').value);
  const filter = $('filter').value;
  const includesPopulation = item => !filter || item.population === filter;
  const results = [];
  for (const demo of demos.filter(includesPopulation)) {
    if (!demo.name.toLowerCase().includes(query)) continue;
    const card = node('details', null, 'card');
    card.append(node('summary', demo.name + ' · ' + demo.population), description(fields(demo)), node('small', demo.source));
    results.push(card);
  }
  const citedPages = new Set();
  for (const entry of linkedReferences().filter(includesPopulation)) {
    if (![entry.name, entry.alias].some(name => normalizeSearch(name).includes(query))) continue;
    citedPages.add(entry.manual.id + ":" + entry.page);
    const card = node('article', null, 'card stack');
    card.append(node('h2', entry.name), muted(`${citation(entry.manual)} · p. ${entry.page}`),
      action('Open cited page', () => openManual(entry.manual, entry.page)));
    results.push(card);
  }
  if (query.length >= 2) {
    for (const manual of manuals.filter(includesPopulation)) {
      manual.pages.forEach((content, offset) => {
        if (citedPages.has(manual.id + ':' + (offset + 1))) return;
        const pageText = normalizeSearch(content);
        const match = pageText.indexOf(query);
        if (match < 0) return;
        const card = node('article', null, 'card stack');
        card.append(node('h2', `Text match · p. ${offset + 1}`), muted(citation(manual)),
          muted('…' + pageText.slice(Math.max(0, match - 40), match + query.length + 60) + '…'),
          action('Open matching page', () => openManual(manual, offset + 1)));
        results.push(card);
      });
    }
  }
  if (!results.length) results.push(muted('No matching references.'));
  if (!manuals.length) {
    const link = node('a', 'Import reference PDFs in Library');
    link.href = '#library';
    results.push(link);
  }
  $('hits').replaceChildren(...results);
}
$('query').addEventListener('input', renderSearch);
$('filter').addEventListener('change', renderSearch);

function clearResult() {
  $('result').replaceChildren(node('h2', 'Check results'), muted('Run a double check to see the outcome and each criterion.'));
}
function updateOrder() {
  $('run').disabled = !medicine.value;
  $('access-field').hidden = !selectedDemo()?.access;
  $('infusion-label').textContent = form.elements.byRate.checked ? 'Pump rate (mL/h)' : 'Duration (minutes)';
  clearResult();
}
function updateMedication(keepSelection = false) {
  const selected = keepSelection ? medicine.value : '';
  medicine.replaceChildren();
  option(medicine, 'Select medication', '');
  [...demos, ...linkedReferences()].filter(entry => entry.population === population.value)
    .forEach(entry => option(medicine, entry.name, entry.id));
  medicine.value = [...medicine.options].some(item => item.value === selected) ? selected : '';
  updateOrder();
}
function resetPreparation() {
  for (const name of ['dose', 'volume', 'infusion', 'diluent', 'access']) form.elements[name].value = '';
  form.elements.unit.value = 'mg';
  form.elements.byRate.checked = false;
}
population.addEventListener('change', () => { resetPreparation(); updateMedication(); });
medicine.addEventListener('change', () => { resetPreparation(); updateOrder(); });
form.addEventListener('input', updateOrder);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!medicine.value) return;
  const order = Object.fromEntries(new FormData(form));
  order.byRate = form.elements.byRate.checked;
  const demo = selectedDemo();
  const reference = linkedReferences().find(entry => entry.id === medicine.value);
  const checks = evaluate(order, demo && approvals().get(demo.id) ? demo : null);
  const source = demo?.source ?? (reference ? `${citation(reference.manual)} · p. ${reference.page} · ${reference.name}` : 'No source in the evaluation rule set');
  const cards = checks.map(check => {
    const card = node('article', null, 'result-item stack');
    card.append(node('h3', check.name), badge(check.outcome), description([['Actual', check.actual], ['Reference', check.reference]]),
      muted(check.detail), node('small', source));
    if (reference) card.append(action('Open source', () => openManual(reference.manual, reference.page)));
    return card;
  });
  $('result').replaceChildren(node('h2', 'Check results'), badge(overall(checks)), ...cards);
});

function renderLibrary(openId) {
  const active = approvals();
  $('manuals').replaceChildren(...(manuals.length ? manuals.map(manual => {
    const row = node('div', null, 'rule stack');
    row.append(node('h3', citation(manual)), muted(`${manual.pages.length} pages`), action('Open PDF', () => openManual(manual, 1)));
    return row;
  }) : [muted('No manuals imported.')]));
  $('history').replaceChildren(...(events.length ? [...events].reverse().map(event =>
    muted(`${demos.find(demo => demo.id === event.fixture)?.name ?? event.fixture} · ${event.approved ? 'Activated' : 'Deactivated'} · ${event.reviewer} · ${event.at}`)
  ) : [muted('No review events recorded.')]));
  $('reviews').replaceChildren(...demos.map(demo => {
    const details = node('details', null, 'rule');
    details.open = openId === demo.id;
    const reviewer = active.get(demo.id);
    const content = node('div', null, 'stack');
    const label = node('label', 'Reviewer name or initials');
    const input = node('input');
    input.maxLength = 120;
    label.append(input);
    const message = node('p', null, 'muted');
    message.setAttribute('role', 'status');
    const buttons = node('div', null, 'actions');
    const record = async approved => {
      const name = input.value.trim();
      if (!name) { message.textContent = 'Enter the reviewer name or initials.'; input.focus(); return; }
      approve.disabled = deactivate.disabled = true;
      try {
        await add('reviews', { fixture: demo.id, reviewer: name, approved, at: new Date().toISOString() });
        events = await records('reviews');
        clearResult();
        renderLibrary(demo.id);
      } catch {
        message.textContent = 'Could not save the review in this browser.';
        approve.disabled = false;
        deactivate.disabled = !reviewer;
      }
    };
    const approve = action('Approve and activate', () => record(true));
    const deactivate = action('Deactivate', () => record(false));
    approve.disabled = !storageReady;
    deactivate.disabled = !storageReady || !reviewer;
    buttons.append(approve, deactivate);
    content.append(description(fields(demo)), node('small', demo.source), muted(reviewer ? 'Approved by ' + reviewer : 'Approval required'), label, buttons, message);
    details.append(node('summary', `${demo.name} · ${reviewer ? 'Active' : 'Inactive'}`), content);
    return details;
  }));
}

const importForm = $('import-form');
const importButton = importForm.querySelector('button');
importButton.disabled = true;
async function archive(file, fallback, multiple, archived, status) {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  if (archived.has(id)) return 'Already archived';
  const known = knownManuals.get(id);
  if (!known && (multiple || !fallback.version)) {
    return 'For this PDF, enter its population and version and import it separately';
  }
  let pdf;
  try {
    pdf = await loadPDF(bytes);
    const pages = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      status.textContent = `Reading ${file.name} · page ${page} of ${pdf.numPages}…`;
      const text = await (await pdf.getPage(page)).getTextContent();
      pages.push(text.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join(''));
    }
    await add('manuals', {
      ...(known ?? fallback), id, filename: file.name, file, pages, importedAt: Date.now(),
    });
    archived.add(id);
    return pages.some(page => page.trim()) ? 'Archived' : 'Archived · no searchable text found';
  } finally {
    if (pdf) await pdf.destroy().catch(() => {});
  }
}

importForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(importForm);
  const files = values.getAll('pdf').filter(file => file.size);
  const fallback = { population: values.get('population'), version: values.get('version').trim() };
  const status = $('import-status');
  if (!files.length) { status.textContent = 'Select a readable PDF.'; return; }
  importButton.disabled = true;
  status.textContent = 'Reading PDFs locally…';
  try {
    const archived = new Set((await records('manuals')).map(manual => manual.id));
    const messages = [];
    for (const file of files) {
      try {
        messages.push(`${file.name} · ${await archive(file, fallback, files.length > 1, archived, status)}`);
      } catch (error) {
        const message = error?.name === 'QuotaExceededError' || error?.name === 'DataCloneError'
          ? 'Browser storage could not save the PDF'
          : 'Could not archive this PDF. Check that it is readable and unlocked';
        messages.push(`${file.name} · ${message}`);
      }
    }
    await refreshManuals();
    renderSearch();
    renderLibrary();
    updateMedication(true);
    status.replaceChildren(...messages.map(message => node('span', message)));
    if (messages.every(message => / · (Archived|Already archived)/.test(message))) {
      importForm.elements.version.value = '';
      importForm.elements.pdf.value = '';
    }
  } catch {
    status.textContent = 'Could not access the reference library in this browser.';
  } finally {
    importButton.disabled = false;
  }
});

async function refreshManuals() {
  manuals = (await records('manuals'))
    .map(manual => ({ ...manual, ...knownManuals.get(manual.id) }))
    .sort((a, b) => b.importedAt - a.importedAt);
}
renderSearch();
updateMedication();
renderLibrary();
try {
  await Promise.all([refreshManuals(), records('reviews').then(result => { events = result; })]);
  storageReady = true;
  importButton.disabled = false;
  renderSearch();
  renderLibrary();
  updateMedication(true);
} catch {
  $('import-status').textContent = 'Browser storage is unavailable. PDF import and rule activation are disabled.';
}
