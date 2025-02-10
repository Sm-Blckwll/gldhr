$(document).ready(function () {
    const date = new Date();
    const version = '<p>v2.1✨</p>';





    const mapOptions = {
        minZoom: 4,
        maxZoom: 18,
        center: [51.505, -0.09],
        zoom: 5
    };

    const map = L.map('map', mapOptions);

    L.tileLayer('http://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);


    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    const dateParam = params.get('date');




    if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng]);
    }
    if (dateParam) {
        const [day, month, year] = dateParam.split('-').map(Number);
        date.setDate(day);
        date.setMonth(month - 1);
        date.setFullYear(year);
    }

    const initialCenter = map.getCenter();
    const initialTimes = SunCalc.getTimes(date, initialCenter.lat, initialCenter.lng);
    const initialSunrise = initialTimes.sunrise ? new Date(initialTimes.sunrise) : NaN;
    const initialSunset = initialTimes.sunset ? new Date(initialTimes.sunset) : NaN;

    drawSunLines(initialCenter, initialSunrise, initialSunset);
    calculateGoldenHour(initialCenter);
    $('path.leaflet-interactive').delay(200).fadeOut(0).fadeIn(100);



    $('#shareButton').click(() => {
        const center = map.getCenter();
        const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${center.lat}&lng=${center.lng}&date=${date.toLocaleDateString('en-GB').replace(/\//g, '-')}`;
        copyToClipboard(shareUrl);

        function updateTitle(content) {
            $('#title').fadeOut(200, function () {
                $(this).html(content).fadeIn(200);
            });
        }
        const ogTitle = $('#title').html();
        updateTitle(`Saved to clipboard${version}`);
        setTimeout(function () {
            updateTitle(ogTitle);
        }, 2000);

    });


    function copyToClipboard(text) {
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }


    $("#startButton").click(() => {
        $("#loading").delay(100).fadeOut("fast");
        loadGoogleAnalytics('G-S5ZJW576QK');
    });

    $("#help").click(() => {
        $("#theHelp").delay(100).fadeToggle("fast");
    });

    $("#cal").click(() => {
        $("<div id='calendar'></div>").dialog({
            modal: true,
            title: "Select Date",
            open() {
                $("#calendar").datepicker({
                    dateFormat: "dd-mm-yy",
                    onSelect: function (selectedDate) {
                        const [day, month, year] = selectedDate.split("-").map(Number);
                        date.setDate(day);
                        date.setMonth(month - 1);
                        date.setFullYear(year);
                        calculateGoldenHour(map.getCenter());
                        drawSunLines(map.getCenter(), date);
                        $('path.leaflet-interactive').delay(100).fadeOut(0).fadeIn(100);
                        $("#calendar").dialog("close");
                    }
                });
            },
            close() {
                $("#calendar").remove();
            }
        });
    });


    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker registered with scope:', registration.scope))
            .catch(error => console.log('Service Worker registration failed:', error));
    }


    const userLocale = navigator.language || 'en-US';
    const localDate = new Intl.DateTimeFormat(userLocale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    $('#dateResult').text(`Date: ${localDate}`);


    $('#prev-day, #next-day').click(function () {
        const dayOffset = $(this).attr('id') === 'prev-day' ? -1 : 1;
        date.setDate(date.getDate() + dayOffset);
        calculateGoldenHour(map.getCenter());
        drawSunLines(map.getCenter(), date);
        $('path.leaflet-interactive').delay(100).fadeOut(0).fadeIn(100);
    });


    map.on('moveend', () => calculateGoldenHour(map.getCenter()));


    async function loadGoogleAnalytics(id) {
        const script = document.createElement('script');
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        script.async = true;
        document.head.appendChild(script);

        script.onload = function () {
            window.dataLayer = window.dataLayer || [];
            function gtag() { dataLayer.push(arguments); }
            gtag('js', new Date());
            gtag('config', id);
        };
    }

    async function loadTimeZoneData(lat, lng) {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.error("Invalid coordinates: Latitude must be between -90 and 90, and Longitude must be between -180 and 180. Please refresh.");
            return;
        }
        try {
            const timeZone = tzlookup(lat, lng);
            return timeZone || 'UTC';
        } catch (error) {
            console.error("Error fetching timezone data: ", error);
            return 'UTC';
        }
    }

    async function calculateGoldenHour(latlng) {
        const { lat, lng } = latlng;

        resetGoldenHourDisplay();

        const timeZone = await loadTimeZoneData(lat, lng);
        const times = SunCalc.getTimes(date, lat, lng);

        const sunrise = times.sunrise ? new Date(times.sunrise) : NaN;
        const sunset = times.sunset ? new Date(times.sunset) : NaN;

        if (isNaN(sunrise) && isNaN(sunset)) {
            const noonAltitude = SunCalc.getPosition(date, lat, lng).altitude;

            if (noonAltitude > 0) {
                $('#title').html(`Polar Day 😁${version}`);
                updateGoldenHourDisplay('🌞', 'rgba(255,223,140,1)');
            } else {
                $('#title').html(`Polar Night 😭${version}`);
                updateGoldenHourDisplay('🌚', 'rgb(140, 142, 255)');
            }
            return;
        }

        if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
            updateGoldenHourDisplay('No sunrise or sunset at this location.', 'grey');
        } else {
            $('#title').html(`Golden Hour Map${version}`);
            const goldenHourStartFrom = formatTime(sunrise, timeZone);
            const goldenHourStartTo = formatTime(new Date(sunrise.getTime() + 3600000), timeZone);
            const goldenHourEndFrom = formatTime(new Date(sunset.getTime() - 3600000), timeZone);
            const goldenHourEndTo = formatTime(sunset, timeZone);

            updateGoldenHourDisplay({
                startFrom: goldenHourStartFrom,
                startTo: goldenHourStartTo,
                endFrom: goldenHourEndFrom,
                endTo: goldenHourEndTo
            });

            $('#dateResult').text(`Date: ${date.toLocaleDateString('en-GB')}`);
            $('#zoneResult').text(`Time Zone: (${timeZone})`);
        }
    }

    function drawSunLines(center, selectedDate) {
        if (window.sunriseLine || window.sunsetLine) {
            [window.sunriseLine, window.sunsetLine].forEach(line => line && map.removeLayer(line));
            window.sunriseLine = window.sunsetLine = null;
        }

        const { lat, lng } = center;
        const R = 6378.1;


        const distance = 10000;

        function calculateEndPoint(lat, lng, azimuth, distance) {
            const bearing = azimuth * (Math.PI / 180);
            const lat1 = lat * (Math.PI / 180);
            const lng1 = lng * (Math.PI / 180);

            const lat2 = Math.asin(
                Math.sin(lat1) * Math.cos(distance / R) +
                Math.cos(lat1) * Math.sin(distance / R) * Math.cos(bearing)
            );

            const lng2 = lng1 + Math.atan2(
                Math.sin(bearing) * Math.sin(distance / R) * Math.cos(lat1),
                Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
            );

            return [lat2 * (180 / Math.PI), lng2 * (180 / Math.PI)];
        }

        function addLine(time, color, dashArray, lineName) {
            if (!isNaN(time.getTime())) {
                const position = SunCalc.getPosition(time, lat, lng);
                const azimuth = position.azimuth * (180 / Math.PI) + 180;
                const endPoint = calculateEndPoint(lat, lng, azimuth, distance);

                window[lineName] = L.polyline([center, endPoint], {
                    color: color,
                    weight: 2,
                    dashArray: dashArray,
                    noClip: true,
                }).addTo(map);
                $('path.leaflet-interactive').fadeOut(0);


            }
        }

        const times = SunCalc.getTimes(selectedDate, lat, lng);
        const sunrise = times.sunrise ? new Date(times.sunrise) : NaN;
        const sunset = times.sunset ? new Date(times.sunset) : NaN;

        addLine(sunset, 'rgb(255, 140, 140)', '15, 5', 'sunsetLine');
        addLine(sunrise, 'rgb(255, 146, 210)', '15, 5', 'sunriseLine');
    }

    map.on('movestart', () => $('path.leaflet-interactive').fadeOut(50));
    map.on('moveend', () => {
        
        drawSunLines(map.getCenter(), date);
        $('path.leaflet-interactive').delay(100).fadeIn(100);
        
    });
    map.on('zoom', () => drawSunLines(map.getCenter(), date));


    function resetGoldenHourDisplay() {
        $('#riseBar, #setBar').css("background", "white");
        $('#goldenHours').css("color", "white");
    }

    function formatTime(date, timeZone) {
        return moment(date).tz(timeZone).format('HH:mm');
    }

    function updateGoldenHourDisplay(timings, color = "black") {
        $('#goldenHours').css("color", color);

        if (typeof timings === 'string') {
            ['#riseFrom', '#riseTo', '#setFrom', '#setTo'].forEach(id => $(id).html(timings));
            $('#riseBar, #setBar').css("background", color);
        } else {
            $('#riseFrom, #riseTo, #setFrom, #setTo').each((index, element) => {
                const id = element.id;
                const key = id.charAt(0) === 'r' ? `start${id.slice(4)}` : `end${id.slice(3)}`;
                $(element).html(timings[key]);
            });

            $('#riseBar')
                .css("background", "linear-gradient(90deg, rgb(255, 146, 210) 0%, rgb(255, 238, 140) 100%)")
                .fadeOut(100)
                .fadeIn(100);

            $('#setBar')
                .css("background", "linear-gradient(270deg, rgb(255, 140, 140) 0%, rgb(255, 238, 140) 100%)")
                .fadeOut(100)
                .fadeIn(100);
        }
    }


    const osmGeocoder = new L.Control.OSMGeocoder({
        collapsed: true,
        position: 'topleft',
        text: '-',
        placeholder: '',
        bounds: null,
        callback(results) {
            const [firstLat, secondLat, firstLng, secondLng] = results[0].boundingbox.map(Number);
            const bounds = new L.LatLngBounds([firstLat, firstLng], [secondLat, secondLng]);
            map.fitBounds(bounds);
        }
    });
    map.addControl(osmGeocoder);

    L.geolet({
        position: 'bottomleft',
        className: 'locDot',
        popupContent(latlng) {
            return `Your location: ${latlng.lat}, ${latlng.lng}`;
        }
    }).addTo(map);
});
