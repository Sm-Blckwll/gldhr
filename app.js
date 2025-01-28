$(document).ready(function () {
    const date = new Date();

    // Initialize map
    const mapOptions = {
        minZoom: 4,
        maxZoom: 18,
        center: [51.505, -0.09],
        zoom: 5
    };

    const map = L.map('map', mapOptions);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        maxZoom: 18
    }).addTo(map);

    // Handle Start Button click
    $("#startButton").click(function () {
        $("#loading").delay(100).fadeOut("fast");

        var script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-S5ZJW576QK';
        script.async = true;
        document.head.appendChild(script);

        script.onload = function () {
            window.dataLayer = window.dataLayer || [];
            function gtag() { dataLayer.push(arguments); }
            gtag('js', new Date());
            gtag('config', 'G-S5ZJW576QK');
        };
    });

    // Handle Help Button click
    $("#help").click(function () {
        $("#theHelp").delay(100).fadeToggle("fast");
    });

    // Handle Calendar Button click
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
                        const center = map.getCenter();
                        calculateGoldenHour(center);
                        $("#calendar").dialog("close");
                    }
                });
            },
            close: function () {
                $("#calendar").remove();
            }
        });
    });

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(function (registration) {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(function (error) {
                console.log('Service Worker registration failed:', error);
            });
    }

    // Update date result
    const userLocale = navigator.language || 'en-US';
    const localDate = new Intl.DateTimeFormat(userLocale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    document.getElementById('dateResult').innerHTML = `Date: ${localDate}`;




    $('#prev-day').click(function () {
        date.setDate(date.getDate() - 1);
        const center = map.getCenter();
        calculateGoldenHour(center);
    });

    $('#next-day').click(function () {
        date.setDate(date.getDate() + 1);
        const center = map.getCenter();
        calculateGoldenHour(center);
    });

    map.on('moveend', async function () {
        const center = map.getCenter();
        calculateGoldenHour(center);
    });

    // Load Timezone data using tz-lookup
    async function loadTimeZoneData(lat, lng) {
        const timeZone = tzlookup(lat, lng);
        return timeZone || 'UTC'; // Fallback to 'UTC' if no time zone found
    }

    // Calculate Golden Hour
    async function calculateGoldenHour(latlng) {

        $('#riseBar').css("background", "white");
        $('#setBar').css("background", "white");
        $('#goldenHours').css("color", "white");

        let lat = latlng.lat;
        let lng = latlng.lng;

        // Get Time Zone using tz-lookup
        const timeZone = await loadTimeZoneData(lat, lng);

        const times = SunCalc.getTimes(date, lat, lng);
        const sunrise = new Date(times.sunrise);
        const sunset = new Date(times.sunset);

        const goldenHourStartFrom = moment(sunrise).tz(timeZone).format('HH:mm');
        const goldenHourStartTo = moment(sunrise).tz(timeZone).add(1, 'hour').format('HH:mm');
        const goldenHourEndFrom = moment(sunset).tz(timeZone).subtract(1, 'hour').format('HH:mm');
        const goldenHourEndTo = moment(sunset).tz(timeZone).format('HH:mm');

        $('#goldenHours').css("color", "black");

        $('#riseFrom').html(goldenHourStartFrom);
        $('#riseBar').css("background", "linear-gradient(90deg, rgba(255,146,146,1) 0%, rgba(255,223,140,1) 100%)");
        $('#riseTo').html(goldenHourStartTo);

        $('#setFrom').html(goldenHourEndFrom);
        $('#setBar').css("background", "linear-gradient(270deg, rgba(255,146,146,1) 0%, rgba(255,223,140,1) 100%)");
        $('#setTo').html(goldenHourEndTo);

        $('#dateResult').html(`Date: ${date.toLocaleDateString('en-GB')}`);
        $('#zoneResult').html(`Time Zone: (${timeZone})`);

    }

    // Add Geocoder
    var osmGeocoder = new L.Control.OSMGeocoder({
        collapsed: true,
        position: 'topleft',
        text: '-',
        placeholder: '',
        bounds: null,
        callback: function (results) {
            var bbox = results[0].boundingbox,
                first = new L.LatLng(bbox[0], bbox[2]),
                second = new L.LatLng(bbox[1], bbox[3]),
                bounds = new L.LatLngBounds([first, second]);
            map.fitBounds(bounds);
        }
    });
    map.addControl(osmGeocoder);
    L.geolet({ position: 'bottomleft', className: 'locDot', popupContent: function (latlng) { return 'Your location: ' + latlng.lat + ', ' + latlng.lng; } }).addTo(map);

});