/*
    Variables
*/
let colorRGB;
let colorPicker = -1;
let lampList = [];
let plugList = [];

/*
    Constants
    DO NOT CHANGE THIS CODE
*/
const colors = [
    { r: 0xe4, g: 0x3f, b: 0x00 },
    { r: 0xfa, g: 0xe4, b: 0x10 },
    { r: 0x55, g: 0xcc, b: 0x3b },
    { r: 0x09, g: 0xad, b: 0xff },
    { r: 0x6b, g: 0x0e, b: 0xfd },
    { r: 0xe7, g: 0x0d, b: 0x86 },
    { r: 0xe4, g: 0x3f, b: 0x00 }
];

/*
   Place information on the DOM when loaded
*/
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Initializing application...");

    const colorWheel = document.getElementById("color-wheel");
    if (colorWheel) {
        setColorListeners();
        console.log("Color listeners set successfully.");
    } else {
        console.error("Color wheel not found in DOM.");
    }

    await placeShellyOnDom();
    await placeHueOnDom();

    if (plugList.length > 0 || lampList.length > 0) {
        await refreshAllStates();
        setInterval(refreshAllStates, 1000); // Refresh every second
    }
});

/*
    Refresh all states
*/
async function refreshAllStates() {
    await RefreshShellyInfo();
    await RefreshHueInfo();
}

/*
    Refresh the information of the Shelly plugs
*/
async function RefreshShellyInfo() {
    if (plugList.length > 0) {
        for (let plug of plugList) {
            const power = await GetPlugPower(plug.id);
            document.getElementById(`shellypower${plug.id}`).innerText = `${power}W`;
        }
    }
}

/*
    Refresh the information of the Philips Hue lamps
*/
async function RefreshHueInfo() {
    for (let lamp of lampList) {
        const updatedLamp = await getLightInfo(lamp.id);
        lamp.state = updatedLamp.state;

        document.getElementById(`bulb${lamp.id}`).style.color = lamp.state.on ? `hsl(${360 * lamp.state.hue / 65535}, ${100 * lamp.state.sat / 254}%, ${100 * lamp.state.bri / 254}%)` : 'grey';
        document.getElementById(`power${lamp.id}`).style.color = lamp.state.on ? "green" : "red";
        document.getElementById(`brightness${lamp.id}`).innerText = `Brightness: ${lamp.state.bri}`;
        document.getElementById(`dimming${lamp.id}`).value = lamp.state.bri;
    }
}

/*
    Set up color listeners for the color wheel
*/
function setColorListeners() {
    document.getElementById("color-wheel").addEventListener("mousemove", function (e) {
        const rect = e.target.getBoundingClientRect();
        const x = 2 * (e.clientX - rect.left) / (rect.right - rect.left) - 1;
        const y = 1 - 2 * (e.clientY - rect.top) / (rect.bottom - rect.top);

        let a = ((Math.PI / 2 - Math.atan2(y, x)) / Math.PI) * 180;
        if (a < 0) a += 360;

        a = (a / 360) * (colors.length - 1);

        const a0 = Math.floor(a) % colors.length;
        const a1 = (a0 + 1) % colors.length;
        const c0 = colors[a0];
        const c1 = colors[a1];

        const a1w = a - Math.floor(a);
        const a0w = 1 - a1w;
        colorRGB = {
            r: c0.r * a0w + c1.r * a1w,
            g: c0.g * a0w + c1.g * a1w,
            b: c0.b * a0w + c1.b * a1w
        };

        let r = Math.sqrt(x * x + y * y);
        if (r > 1) r = 1;

        const cw = r < 0.8 ? r / 0.8 : 1;
        const ww = 1 - cw;
        colorRGB.r = Math.round(colorRGB.r * cw + 255 * ww);
        colorRGB.g = Math.round(colorRGB.g * cw + 255 * ww);
        colorRGB.b = Math.round(colorRGB.b * cw + 255 * ww);
    });

    document.getElementById("color-wheel").addEventListener("click", () => {
        if (colorPicker < 0 || !lampList[colorPicker]) {
            console.error("Invalid colorPicker or lampList entry.");
            return;
        }
    
        const lamp = lampList[colorPicker];
        const hsl = rgbToHSB(colorRGB.r, colorRGB.g, colorRGB.b);
    
        if (!lamp.state.on) {
            console.warn(`Lamp ${lamp.name} is off. Saving color for later.`);
            lamp.savedColor = {
                hue: hsl.hue,
                bri: hsl.bri,
                sat: hsl.sat
            };
            colorPicker = -1;
            document.getElementById("choosecolor").style.display = "none";
            return;
        }
    
        lamp.hue = hsl.hue;
        lamp.bri = hsl.bri;
        lamp.sat = hsl.sat;
    
        setLightColor(Number(lamp.id), lamp.hue, lamp.bri, lamp.sat);
    
        document.getElementById("bulb" + lamp.id).style.color = `hsl(${(360 * lamp.hue) / 65535},${(100 * lamp.sat) / 254}%,${(100 * lamp.bri) / 254}%)`;
        document.getElementById("dimming" + lamp.id).value = lamp.bri;
    
        colorPicker = -1;
        document.getElementById("choosecolor").style.display = "none";
    });
}
/*
   Place Shelly information on the DOM and add event listeners
*/
async function placeShellyOnDom() {
    const devicesStatus = await getShellyPlugInfo(); // Fetch plug information
    const devices = devicesStatus.devices_status;
    console.log(devices);

    const container = document.getElementById("container");
    for (const [id, device] of Object.entries(devices)) {
        if (device._dev_info.code === "SHPLG-S") {
            plugList.push({
                id,
                ip: device.wifi_sta.ip,
                name: device.getinfo.fw_info.device,
                isOn: device.relays[0].ison,
                power: device.meters[0].power
            });

            const tile = document.createElement("div");
            tile.classList.add("item");
            tile.innerHTML = `
                <div class="itembody">
                    <i class="fa-solid fa-plug fa-2xl" id="plug${id}"></i>
                    <h5>${device.getinfo.fw_info.device}</h5>
                </div>
                <div class="itemfooter">
                    <div class="footerinfo">
                        <p>Power</p>
                        <p id="shellypower${id}">${device.meters[0].power}W</p>
                    </div>
                    <div></div>
                    <i class="fa-solid fa-power-off" id="onoff${id}" style="color: ${device.relays[0].ison ? 'green' : 'red'};"></i>
                </div>
            `;
            container.appendChild(tile);

            // Add event listener for toggling plug state
            document.getElementById(`onoff${id}`).addEventListener("click", async () => {
                const plug = plugList.find(p => p.id === id);
                const newState = !plug.isOn; // Determine the new state
                const stateText = newState ? "on" : "off"; // Convert to "on"/"off"

                console.log(`Toggling plug ${plug.name} (${id}) to state: ${stateText}`);
                console.log(`Using IP: ${plug.ip}`);

                try {
                    await setPlugState(0, plug.ip, stateText); // Pass "on" or "off" instead of true/false
                    plug.isOn = newState;

                    // Update UI
                    document.getElementById(`onoff${id}`).style.color = newState ? "green" : "red";
                } catch (error) {
                    console.error(`Failed to toggle plug state for ${plug.name}:`, error);
                }
            });
        }
    }
}


/*
    Refresh the information of the Shelly plugs
*/
async function RefreshShellyInfo() {
    if (plugList.length > 0) {
        for (let plug of plugList) {
            const power = await GetPlugPower(plug.id);
            document.getElementById(`shellypower${plug.id}`).innerText = `${power}W`;
        }
    }
}

/*
   Place Philips Hue information on the DOM and add event listeners
*/
async function placeHueOnDom() {
    const lamps = await getLampsInfo(); // Fetch lamp information
    console.log(lamps);

    lampList = Object.keys(lamps).map(id => ({
        id,
        ...lamps[id]
    }));

    const container = document.getElementById("container");
    lampList.forEach(lamp => {
        const tile = document.createElement("div");
        tile.classList.add("item");
                tile.innerHTML = `
            <div class="itembody">
                <i class="fa-solid fa-lightbulb fa-2xl" id="bulb${lamp.id}" style="color: ${lamp.state.on ? `hsl(${360 * lamp.state.hue / 65535}, ${100 * lamp.state.sat / 254}%, ${100 * lamp.state.bri / 254}%)` : 'grey'};"></i>
                <h5>${lamp.name}</h5>
                <p id="brightness${lamp.id}">Brightness: ${lamp.state.bri}</p>
            </div>
            <div class="itemfooter">
                <i class="fa-solid fa-palette" id="color${lamp.id}"></i>
                <input type="range" min="0" max="254" class="slider" id="dimming${lamp.id}" ${lamp.state.on ? "" : "disabled"} value="${lamp.state.bri}"/>
                <i class="fa-solid fa-power-off" id="power${lamp.id}" style="color: ${lamp.state.on ? 'green' : 'red'};"></i>
            </div>
        `;
        container.appendChild(tile);

        // Event listeners for Philips Hue lamp controls
        document.getElementById(`color${lamp.id}`).addEventListener("click", (event) => {
            colorPicker = lampList.findIndex(l => l.id == lamp.id);
            const chooseColorDiv = document.getElementById("choosecolor");
            const rect = event.target.getBoundingClientRect();
            chooseColorDiv.style.top = `${rect.bottom + window.scrollY}px`;
            chooseColorDiv.style.left = `${rect.left + window.scrollX}px`;
            chooseColorDiv.style.display = "block";
        });

        document.getElementById(`dimming${lamp.id}`).addEventListener("change", async (e) => {
            const bri = parseInt(e.target.value);
            await setLightBri(lamp.id, bri);
            lamp.state.bri = bri;
            document.getElementById(`brightness${lamp.id}`).innerText = `Brightness: ${bri}`;
        });

        document.getElementById(`power${lamp.id}`).addEventListener("click", async () => {
            const newState = !lamp.state.on;
            await setLightState(lamp.id, newState);
            lamp.state.on = newState;
        
            if (newState) {
                const updatedLamp = await getLightInfo(lamp.id);
                lamp.state = updatedLamp.state;
        
                if (lamp.savedColor) {
                    lamp.hue = lamp.savedColor.hue;
                    lamp.bri = lamp.savedColor.bri;
                    lamp.sat = lamp.savedColor.sat;
        
                    await setLightColor(Number(lamp.id), lamp.hue, lamp.bri, lamp.sat);
        
                    document.getElementById("bulb" + lamp.id).style.color = `hsl(${(360 * lamp.hue) / 65535},${(100 * lamp.sat) / 254}%,${(100 * lamp.bri) / 254}%)`;
                    document.getElementById("dimming" + lamp.id).value = lamp.bri;
        
                    delete lamp.savedColor;
                }
            }
        
            document.getElementById(`bulb${lamp.id}`).style.color = newState ? `hsl(${360 * lamp.state.hue / 65535}, ${100 * lamp.state.sat / 254}%, ${100 * lamp.state.bri / 254}%)` : 'grey';
            document.getElementById(`power${lamp.id}`).style.color = newState ? "green" : "red";
            document.getElementById(`brightness${lamp.id}`).innerText = `Brightness: ${lamp.state.bri}`;
        });
    });
}
