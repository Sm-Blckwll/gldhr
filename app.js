$(document).ready(function () {
    const date = new Date();
    const version = '<p>v1.8✨</p>';
    

    
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

    calculateGoldenHour(map.getCenter());

    
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
        const timeZone = tzlookup(lat, lng);
        return timeZone || 'UTC';
    }

    async function calculateGoldenHour(latlng) {
        const { lat, lng } = latlng;

        resetGoldenHourDisplay();

        const timeZone = await loadTimeZoneData(lat, lng);
        const times = SunCalc.getTimes(date, lat, lng);

        const sunrise = times.sunrise ? new Date(times.sunrise) : NaN;
        const sunset = times.sunset ? new Date(times.sunset) : NaN;

        // Handle Polar Day or Night
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
    
            ['#riseBar', '#setBar'].forEach(id => {
                const direction = id === '#riseBar' ? '90deg' : '270deg';
                $(id).css("background", `linear-gradient(${direction}, rgba(255,146,146,1) 0%, rgba(255,223,140,1) 100%)`).fadeOut(100).delay(0).fadeIn(100);
            });
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
