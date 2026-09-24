import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {parseHTML} from '../.test-runtime/node_modules/linkedom/esm/index.js';

const html = fs.readFileSync('index.html','utf8');
const {document, window} = parseHTML(html);
const baseline = parseHTML(execFileSync('git',['show','HEAD:index.html'],{encoding:'utf8'})).document;
for (const id of ['evento','pasaporte','escenarios','ponentes','agenda']) {
  assert.equal(document.getElementById(id).outerHTML,baseline.getElementById(id).outerHTML.replaceAll('Ágora del Cénide','Ágora de Cénide').replaceAll('UAEMÉX','UAEMéx'),`${id}: solo correcciones de contenido autorizadas`);
}
assert.equal(document.querySelectorAll('#mapa .venue-row').length,7);
assert.equal(document.querySelector('#mapa .venue-directory').parentElement.className,'container');
assert.equal(document.querySelectorAll('[data-map-open]').length,1);
assert.doesNotMatch(document.getElementById('mapa').textContent,/Mapa próximamente|se publicarán cuando/);
for (const img of document.querySelectorAll('#mapa img, #map-dialog img')) {
  assert.equal(img.getAttribute('src'),'assets/mapa-cu-pdf-preview.jpg?v=1');
  assert.equal(img.getAttribute('loading'),'lazy');
  assert.equal(img.getAttribute('width'),'2400');
  assert.equal(img.getAttribute('height'),'1350');
}
const dialog = document.getElementById('map-dialog');
dialog.showModal = () => { dialog.open=true; };
dialog.close = () => { dialog.open=false; dialog.dispatchEvent(new window.Event('close')); };
let focused;
for (const el of document.querySelectorAll('button')) el.focus = () => { focused=el; };
let restored;
const fakeWindow = {scrollY:650,scrollTo:options => { restored=options.top; }};
document.body.style.position='relative';
vm.runInNewContext(fs.readFileSync('js/map-lightbox.js','utf8'),{document,window:fakeWindow});
const click = el => el.dispatchEvent(new window.Event('click',{bubbles:true}));
const zoom = dialog.querySelector('[data-map-zoom]');
const close = dialog.querySelector('[data-map-close]');
for (const opener of document.querySelectorAll('[data-map-open]')) {
  click(opener);
  assert.equal(dialog.open,true);
  assert.equal(document.body.style.position,'fixed');
  assert.equal(document.body.style.top,'-650px');
  assert.equal(focused,close);
  click(zoom);
  assert.equal(zoom.getAttribute('aria-pressed'),'true');
  assert.ok(dialog.querySelector('.is-zoomed'));
  click(close);
  assert.equal(dialog.open,false);
  assert.equal(document.body.style.position,'relative');
  assert.equal(restored,650);
  assert.equal(focused,opener);
  assert.equal(zoom.getAttribute('aria-pressed'),'false');
  click(opener);
  dialog.dispatchEvent(new window.Event('pointerdown'));
  click(dialog);
  assert.equal(dialog.open,false);
}
console.log('PASS mapa: sedes, PDF y vista previa, dimensiones, apertura, zoom, cierre, fondo, scroll y foco; secciones protegidas intactas. Escape y foco nativo de dialog requieren navegador.');
