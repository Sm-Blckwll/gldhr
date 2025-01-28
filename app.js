$(document).ready(function () {
    $("#startButton").click(function () {
        $("#loading").delay(100).fadeOut("fast");
    
        //Google Tag script
        var script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-S5ZJW576QK';
        script.async = true;
        document.head.appendChild(script);
    
        //Google Tag
        script.onload = function() {
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
    
            gtag('config', 'G-S5ZJW576QK');
        };
    });

    $("#help").click(function () {
        $("#theHelp").delay(100).fadeToggle("fast");
    });

    $("#cal").click(function () {
        $("<div id='calendar'></div>").dialog({
            modal: true,
            title: "Select Date",
            open: function () {
                $("#calendar").datepicker({
                    dateFormat: "dd-mm-yy",
                    onSelect: function (selectedDate) {
                        const dateArray = selectedDate.split("-");
                        date.setDate(parseInt(dateArray[0]));
                        date.setMonth(parseInt(dateArray[1]) - 1);
                        date.setFullYear(parseInt(dateArray[2]));
                        calculateGoldenHour();
                        $("#calendar").dialog("close");
                    }
                });
            },
            close: function () {
                $("#calendar").remove();
            }
        });
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
          .then(function(registration) {
            console.log('Service Worker registered with scope:', registration.scope);
          })
          .catch(function(error) {
            console.log('Service Worker registration failed:', error);
          });
    }

    document.getElementById('dateResult').innerHTML = `Date: ${date.toLocaleDateString('en-GB')}`;
});

$(document).ready(function () {
    const date = new Date();

    const mapOptions = {
        minZoom: 4,
        maxZoom: 18,
        center: [51.505, -0.09],
        zoom: 5
    };

    const pin = L.icon({
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

    goButton.addEventListener("click", async function () {
        const center = map.getCenter();
        await calculateGoldenHour(center);
    });

    async function loadTimeZoneData() {
        const response = await fetch('timezones.json'); // Use your timezone GeoJSON file
        return await response.json();
    }

    async function findTimeZone(lat, lng, geoJsonData) {
        const point = turf.point([lng, lat]); // Turf uses [lng, lat]
        for (const feature of geoJsonData.features) {
            const polygon = feature.geometry;
            if (turf.booleanPointInPolygon(point, polygon)) {
                return feature.properties.tzid;
            }
        }
        return 'Unknown TimeZone';
    }

    async function calculateGoldenHour(latlng) {
        document.getElementById('title').innerHTML = 'Calculating<span class="loading-text">.</span>';
        document.getElementById('riseBar').style.background = "white";
        document.getElementById('setBar').style.background = "white";
        document.getElementById('goldenHours').style.color = "white";

        let lat = latlng.lat;
        let lng = latlng.lng;

        const geoJsonData = await loadTimeZoneData();
        const timeZone = await findTimeZone(lat, lng, geoJsonData);

        const times = SunCalc.getTimes(date, lat, lng);
        const sunrise = new Date(times.sunrise);
        const sunset = new Date(times.sunset);

        const goldenHourStartFrom = moment(sunrise).format('HH:mm');
        const goldenHourStartTo = moment(sunrise).add(1, 'hour').format('HH:mm');
        const goldenHourEndFrom = moment(sunset).subtract(1, 'hour').format('HH:mm');
        const goldenHourEndTo = moment(sunset).format('HH:mm');

        document.getElementById('goldenHours').style.color = "black";

        document.getElementById('riseFrom').innerHTML = `${goldenHourStartFrom}`;
        document.getElementById('riseBar').style.background = "linear-gradient(90deg, rgba(255,146,146,1) 0%, rgba(255,223,140,1) 100%)";
        document.getElementById('riseTo').innerHTML = `${goldenHourStartTo}`;

        document.getElementById('setFrom').innerHTML = `${goldenHourEndFrom}`;
        document.getElementById('setBar').style.background = "linear-gradient(270deg, rgba(255,146,146,1) 0%, rgba(255,223,140,1) 100%)";
        document.getElementById('setTo').innerHTML = `${goldenHourEndTo}`;

        document.getElementById('dateResult').innerHTML = `Date: ${date.toLocaleDateString('en-GB')}`;
        document.getElementById('zoneResult').innerHTML = `Time Zone: (${timeZone})`;
        document.getElementById('title').innerHTML = 'Done!';
    }
});


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
