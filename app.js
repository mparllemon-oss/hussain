const $ = id => document.getElementById(id);
const ui = {
  dot: $('dot'), name: $('deviceName'), state: $('deviceState'), support: $('support'),
  scan: $('scanBtn'), disconnect: $('disconnectBtn'), battery: $('battery'), batteryBtn: $('batteryBtn'),
  heart: $('heart'), heartBtn: $('heartBtn'), services: $('services'), send: $('sendBtn'), log: $('log')
};

let device = null, server = null, heartChar = null;

function log(msg) {
  const t = new Date().toLocaleTimeString();
  ui.log.textContent += `[${t}] ${msg}\n`;
  ui.log.scrollTop = ui.log.scrollHeight;
}

function setConnected(on) {
  ui.dot.className = 'dot' + (on ? ' on' : '');
  ui.disconnect.disabled = ui.batteryBtn.disabled = ui.heartBtn.disabled = ui.send.disabled = !on;
  ui.state.textContent = on ? 'Connected' : 'Tap Scan to choose a nearby device.';
  if (!on) {
    ui.name.textContent = 'No device connected';
    ui.battery.textContent = ui.heart.textContent = '--';
    ui.heartBtn.textContent = 'Start heart rate';
    ui.services.innerHTML = '<li class="empty">Connect to a device to list its services.</li>';
    heartChar = null;
  }
}

if (!navigator.bluetooth) {
  ui.support.textContent = 'Web Bluetooth is not available. Use Chrome or Edge over HTTPS or localhost.';
  ui.scan.disabled = true;
} else {
  ui.support.textContent = 'Ready. Works with Bluetooth Low Energy devices.';
}

function uuid(v) { return /^0x/i.test(v) ? parseInt(v, 16) : v.toLowerCase(); }

async function scan() {
  try {
    ui.dot.className = 'dot busy';
    ui.state.textContent = 'Scanning...';
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['battery_service', 'heart_rate', 'device_information']
    });
    device.addEventListener('gattserverdisconnected', () => { log('Device disconnected.'); setConnected(false); });
    ui.name.textContent = device.name || 'Unnamed device';
    ui.state.textContent = 'Connecting...';
    server = await device.gatt.connect();
    setConnected(true);
    ui.name.textContent = device.name || 'Unnamed device';
    log(`Connected to ${device.name || device.id}`);
    listServices();
  } catch (e) {
    setConnected(false);
    log(`Scan failed: ${e.message}`);
  }
}

async function listServices() {
  try {
    const list = await server.getPrimaryServices();
    ui.services.innerHTML = list.length ? '' : '<li class="empty">No accessible services found.</li>';
    list.forEach(s => { const li = document.createElement('li'); li.textContent = s.uuid; ui.services.append(li); });
    log(`Found ${list.length} service(s).`);
  } catch (e) { log(`Could not list services: ${e.message}`); }
}

async function readBattery() {
  try {
    const svc = await server.getPrimaryService('battery_service');
    const chr = await svc.getCharacteristic('battery_level');
    const val = await chr.readValue();
    ui.battery.textContent = val.getUint8(0) + '%';
    log(`Battery level: ${val.getUint8(0)}%`);
  } catch (e) { log(`Battery unavailable: ${e.message}`); }
}

async function toggleHeart() {
  try {
    if (heartChar) {
      await heartChar.stopNotifications();
      heartChar = null;
      ui.heartBtn.textContent = 'Start heart rate';
      return;
    }
    const svc = await server.getPrimaryService('heart_rate');
    heartChar = await svc.getCharacteristic('heart_rate_measurement');
    heartChar.addEventListener('characteristicvaluechanged', e => {
      const v = e.target.value;
      const bpm = (v.getUint8(0) & 1) ? v.getUint16(1, true) : v.getUint8(1);
      ui.heart.textContent = bpm + ' bpm';
    });
    await heartChar.startNotifications();
    ui.heartBtn.textContent = 'Stop heart rate';
    log('Heart rate notifications started.');
  } catch (e) { heartChar = null; log(`Heart rate unavailable: ${e.message}`); }
}

async function sendText() {
  const s = $('svcUuid').value.trim(), c = $('chrUuid').value.trim(), msg = $('message').value;
  if (!s || !c || !msg) { log('Enter a service UUID, characteristic UUID and text.'); return; }
  try {
    const svc = await server.getPrimaryService(uuid(s));
    const chr = await svc.getCharacteristic(uuid(c));
    await chr.writeValue(new TextEncoder().encode(msg));
    log(`Sent: ${msg}`);
    $('message').value = '';
  } catch (e) { log(`Send failed: ${e.message}. Add the service to optionalServices in app.js if it was not listed.`); }
}

ui.scan.onclick = scan;
ui.disconnect.onclick = () => device && device.gatt.connected && device.gatt.disconnect();
ui.batteryBtn.onclick = readBattery;
ui.heartBtn.onclick = toggleHeart;
ui.send.onclick = sendText;
$('clearBtn').onclick = () => (ui.log.textContent = '');
