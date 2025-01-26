$(document).ready(function () {
    $("#startButton").click(function () {
        $("#loading").delay(100).fadeOut("fast");
    });

    $("#help").click(function () {
        $("#theHelp").delay(100).fadeIn("fast");
    });
});
const mapOptions = {
    minZoom: 4,
    maxZoom: 18,
    center: [51.505, -0.09],
    zoom: 5
};

var pin = L.icon({
    iconUrl: 'location-pin-solid.svg',
    iconSize: [19, 47.5],
    iconAnchor: [10, 37.5],
    popupAnchor: [0, -34]
});

const map = L.map('map', mapOptions);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
    maxZoom: 18
}).addTo(map);

const goButton = document.getElementById("go");
const prevDayButton = document.getElementById("prev-day");
const nextDayButton = document.getElementById("next-day");
const date = new Date();

prevDayButton.addEventListener("click", () => {
    date.setDate(date.getDate() - 1);
    calculateGoldenHour();
});

nextDayButton.addEventListener("click", () => {
    date.setDate(date.getDate() + 1);
    calculateGoldenHour();
});

function popUpLatLng(e) {
    var ac = e.latlng.lat.toFixed(4);
    var bc = e.latlng.lng.toFixed(4);
    new L.Marker([ac, bc], { icon: pin }).addTo(map)
        .bindPopup(ac + ", " + bc)
        .openPopup();
    map.setView(e.latlng);
    calculateGoldenHour();
}

map.on('click', function (e) {
    popUpLatLng(e);
});

//map.on('moveend', async function () {
//  await calculateGoldenHour();
//});

goButton.addEventListener("click", async function () {
    await calculateGoldenHour();
});

async function getTimezoneFromCoords(lat, lng) {
    const response = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`);
    const data = await response.json();
    return data.timeZone;
}

async function calculateGoldenHour() {

    document.getElementById('title').innerHTML = 'Waiting for API<span class="loading-text">.</span>';

    let c = map.getCenter();
    let lat = parseFloat(c.lat.toFixed(4));
    let lng = parseFloat(c.lng.toFixed(4));

    const timeZone = await getTimezoneFromCoords(lat, lng);

    const times = SunCalc.getTimes(date, lat, lng);
    const sunrise = new Date(times.sunrise);
    const sunset = new Date(times.sunset);

    const goldenHourStartFrom = moment(sunrise).tz(timeZone).format('HH:mm');
    const goldenHourStartTo = moment(sunrise).tz(timeZone).add(1, 'hour').format('HH:mm');
    const goldenHourEndFrom = moment(sunset).tz(timeZone).subtract(1, 'hour').format('HH:mm');
    const goldenHourEndTo = moment(sunset).tz(timeZone).format('HH:mm');


    document.getElementById('sunriseResult').innerHTML = `
        Sunrise: ${goldenHourStartFrom} - ${goldenHourStartTo}
      `;
    document.getElementById('sunsetResult').innerHTML = `
        Sunset: ${goldenHourEndFrom} - ${goldenHourEndTo}
      `;

    document.getElementById('dateResult').innerHTML = `Date: ${date.toLocaleDateString('en-GB')}`;
    document.getElementById('zoneResult').innerHTML = `Time Zone: (${timeZone})`;
    document.getElementById('title').innerHTML = 'Success!';
}

L.geolet({ position: 'bottomleft', className: 'locDot', popupContent: function (latlng) { return 'Your location: ' + latlng.lat + ', ' + latlng.lng; } }).addTo(map);

var options = {
    collapsed: true,
    position: 'topleft',
    text: '-',
    placeholder: '',
    bounds: null,
    email: null,
    callback: function (results) {
        var bbox = results[0].boundingbox,
            first = new L.LatLng(bbox[0], bbox[2]),
            second = new L.LatLng(bbox[1], bbox[3]),
            bounds = new L.LatLngBounds([first, second]);
        this._map.fitBounds(bounds);
    }
};

var osmGeocoder = new L.Control.OSMGeocoder(options);
map.addControl(osmGeocoder);