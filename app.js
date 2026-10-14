"use strict";


/* =====================================================
   BLUEALERT
   AI MARINE PLASTIC DETECTION + GEOJSON MAPPING
===================================================== */


const API = "/api";


let map;

let imageLayer = null;

let detectionLayer = null;

let driftLayer = null;

let currentGeoJSON = null;

let lastAnalysis = null;


/* =====================================================
   START APPLICATION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        initializeMap();

        initializeForm();

        initializeButtons();

        setDefaultDate();

    }
);


/* =====================================================
   MAP
===================================================== */

function initializeMap() {

    map = L.map("map").setView(
        [17.65, 83.45],
        7
    );


    const street = L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            attribution:
                "&copy; OpenStreetMap contributors"

        }

    );


    const satellite = L.tileLayer(

        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

        {

            attribution:
                "Tiles &copy; Esri"

        }

    );


    street.addTo(map);


    L.control.layers(

        {

            "Street Map": street,

            "Satellite": satellite

        }

    ).addTo(map);


    L.control.scale({

        imperial: false

    }).addTo(map);

}


/* =====================================================
   FORM
===================================================== */

function initializeForm() {

    document
        .getElementById("analysisForm")
        .addEventListener(
            "submit",
            analyzeImage
        );


    document
        .getElementById("satelliteImage")
        .addEventListener(
            "change",
            previewSelectedImage
        );

}


/* =====================================================
   BUTTONS
===================================================== */

function initializeButtons() {

    document
        .getElementById("downloadGeoJSON")
        .addEventListener(
            "click",
            downloadGeoJSON
        );


    document
        .getElementById("clearMap")
        .addEventListener(
            "click",
            clearAnalysis
        );


    document
        .getElementById("driftButton")
        .addEventListener(
            "click",
            simulateDrift
        );

}


/* =====================================================
   DATE
===================================================== */

function setDefaultDate() {

    const date =
        document.getElementById(
            "imageDate"
        );

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    date.value = today;

}


/* =====================================================
   IMAGE PREVIEW
===================================================== */

function previewSelectedImage(event) {

    const file =
        event.target.files[0];

    if (!file) {
        return;
    }


    const image =
        document.getElementById(
            "uploadedImage"
        );


    image.src =
        URL.createObjectURL(file);


    document
        .getElementById(
            "imagePreviewBox"
        )
        .classList
        .remove("hidden");

}


/* =====================================================
   AI ANALYSIS
===================================================== */

async function analyzeImage(event) {

    event.preventDefault();


    const file =
        document.getElementById(
            "satelliteImage"
        ).files[0];


    if (!file) {

        setStatus(
            "Please upload a satellite or drone image.",
            true
        );

        return;
    }


    const latitude =
        Number(
            document.getElementById(
                "imageLatitude"
            ).value
        );


    const longitude =
        Number(
            document.getElementById(
                "imageLongitude"
            ).value
        );


    const date =
        document.getElementById(
            "imageDate"
        ).value;


    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        setStatus(
            "Please enter valid coordinates.",
            true
        );

        return;

    }


    const button =
        document.getElementById(
            "analyzeButton"
        );


    button.disabled = true;

    button.textContent =
        "⏳ AI Analyzing...";


    setStatus(
        "Sending image to the pLitter AI detector..."
    );


    try {

        const formData =
            new FormData();


        formData.append(
            "satelliteImage",
            file
        );


        formData.append(
            "latitude",
            latitude
        );


        formData.append(
            "longitude",
            longitude
        );


        formData.append(
            "imageDate",
            date
        );


        const response = await fetch("/api/analyze", {
    method: "POST",
    body: formData
});


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.message ||
                "AI analysis failed."
            );

        }


        lastAnalysis = result;


        processDetections(
            result
        );


        setStatus(
            `Analysis completed successfully. ${result.predictions.length} possible debris object(s) detected.`
        );


    } catch (error) {

        console.error(error);

        setStatus(
            error.message ||
            "Analysis failed.",
            true
        );

    } finally {

        button.disabled = false;

        button.textContent =
            "🔍 Analyze Marine Image";

    }

}


/* =====================================================
   PROCESS DETECTIONS
===================================================== */

function processDetections(result) {

    const predictions =
        Array.isArray(
            result.predictions
        )
            ? result.predictions
            : [];


    const latitude =
        Number(
            result.image.latitude
        );


    const longitude =
        Number(
            result.image.longitude
        );


    const widthKm =
        Number(
            document.getElementById(
                "footprintWidth"
            ).value
        ) || 5;


    const heightKm =
        Number(
            document.getElementById(
                "footprintHeight"
            ).value
        ) || 5;


    clearMapLayers();


    drawImageFootprint(

        latitude,

        longitude,

        widthKm,

        heightKm

    );


    const geojson =
        createGeoJSON(

            predictions,

            latitude,

            longitude,

            widthKm,

            heightKm

        );


    currentGeoJSON =
        geojson;


    displayGeoJSON(
        geojson
    );


    updateDashboard(

        predictions,

        latitude,

        longitude,

        widthKm,

        heightKm,

        result.image.date

    );


    drawDetections(
        geojson
    );

}


/* =====================================================
   CREATE GEOJSON
===================================================== */

function createGeoJSON(

    predictions,

    centerLat,

    centerLon,

    widthKm,

    heightKm

) {


    const features = [];


    for (
        let i = 0;
        i < predictions.length;
        i++
    ) {


        const detection =
            predictions[i];


        if (
            !Array.isArray(
                detection.bbox
            )
        ) {

            continue;

        }


        const x =
            Number(
                detection.bbox[0]
            );


        const y =
            Number(
                detection.bbox[1]
            );


        const width =
            Number(
                detection.bbox[2]
            );


        const height =
            Number(
                detection.bbox[3]
            );


        /*
         Convert pixel position
         into normalized position.

         We assume the image is
         approximately 960 pixels wide
         after model preprocessing.

         This is a prototype geolocation
         because the uploaded image is not
         guaranteed to contain geographic
         metadata.
        */


        const imageWidth = 960;

        const imageHeight = 960;


        const centerX =
            x + width / 2;


        const centerY =
            y + height / 2;


        const normalizedX =
            clamp(
                centerX / imageWidth,
                0,
                1
            );


        const normalizedY =
            clamp(
                centerY / imageHeight,
                0,
                1
            );


        /*
         Calculate geographic position.
        */


        const lat =
            centerLat +
            (
                0.5 -
                normalizedY
            ) *
            (
                heightKm /
                111
            );


        const lon =
            centerLon +
            (
                normalizedX -
                0.5
            ) *
            (
                widthKm /
                (
                    111 *
                    Math.cos(
                        centerLat *
                        Math.PI /
                        180
                    )
                )
            );


        const confidence =
            Number(
                detection.score
            );


        const priority =
            calculatePriority(
                confidence,
                width,
                height
            );


        features.push({

            type: "Feature",

            geometry: {

                type: "Point",

                /*
                 IMPORTANT:
                 GeoJSON = [longitude, latitude]
                */

                coordinates: [

                    Number(
                        lon.toFixed(6)
                    ),

                    Number(
                        lat.toFixed(6)
                    )

                ]

            },

            properties: {

                id: i + 1,

                type:
                    detection.class ||
                    "floating plastic debris",

                confidence:
                    Number(
                        confidence.toFixed(3)
                    ),

                priority:

                    priority.toLowerCase(),

                bbox: [

                    x,

                    y,

                    width,

                    height

                ]

            }

        });

    }


    return {

        type: "FeatureCollection",

        features: features

    };

}


/* =====================================================
   PRIORITY
===================================================== */

function calculatePriority(

    confidence,

    width,

    height

) {

    const boxArea =
        width * height;


    if (
        confidence >= 0.85 ||
        boxArea >= 20000
    ) {

        return "High";

    }


    if (
        confidence >= 0.75 ||
        boxArea >= 8000
    ) {

        return "Medium";

    }


    return "Low";

}


/* =====================================================
   DRAW IMAGE FOOTPRINT
===================================================== */

function drawImageFootprint(

    lat,

    lon,

    widthKm,

    heightKm

) {


    const latDelta =
        heightKm /
        111;


    const lonDelta =
        widthKm /
        (
            111 *
            Math.cos(
                lat *
                Math.PI /
                180
            )
        );


    const bounds = [

        [
            lat -
            latDelta / 2,

            lon -
            lonDelta / 2
        ],

        [
            lat +
            latDelta / 2,

            lon +
            lonDelta / 2
        ]

    ];


    imageLayer =
        L.rectangle(

            bounds,

            {

                color: "#0ea5e9",

                weight: 2,

                fillOpacity: 0.08,

                dashArray: "6 6"

            }

        ).addTo(map);


    imageLayer.bindPopup(

        `
        <b>Analysis Area</b><br>
        Center: ${lat.toFixed(5)}, ${lon.toFixed(5)}<br>
        Approx. footprint: ${widthKm} × ${heightKm} km
        `

    );


    map.fitBounds(
        bounds,
        {
            padding: [30, 30]
        }
    );

}


/* =====================================================
   DRAW DETECTIONS
===================================================== */

function drawDetections(
    geojson
) {


    detectionLayer =
        L.geoJSON(

            geojson,

            {

                pointToLayer:
                    function (
                        feature,
                        latlng
                    ) {

                        const priority =
                            feature
                                .properties
                                .priority;


                        let color =
                            "#16a34a";


                        if (
                            priority ===
                            "high"
                        ) {

                            color =
                                "#dc2626";

                        }


                        if (
                            priority ===
                            "medium"
                        ) {

                            color =
                                "#f59e0b";

                        }


                        return L.circleMarker(

                            latlng,

                            {

                                radius: 9,

                                color: color,

                                fillColor: color,

                                fillOpacity: 0.85,

                                weight: 3

                            }

                        );

                    },


                onEachFeature:
                    function (
                        feature,
                        layer
                    ) {

                        const p =
                            feature.properties;


                        layer.bindPopup(

                            `
                            <b>Marine Plastic Detection</b>
                            <br><br>

                            <b>Type:</b>
                            ${escapeHTML(p.type)}

                            <br>

                            <b>Confidence:</b>
                            ${(p.confidence * 100).toFixed(1)}%

                            <br>

                            <b>Priority:</b>
                            ${escapeHTML(p.priority)}

                            <br>

                            <b>Coordinates:</b>
                            ${p.coordinates || ""}

                            <br><br>

                            <b>GeoJSON:</b>
                            [${feature.geometry.coordinates[0]},
                            ${feature.geometry.coordinates[1]}]
                            `

                        );

                    }

            }

        ).addTo(map);


    if (
        geojson.features.length
    ) {

        map.fitBounds(
            detectionLayer.getBounds(),
            {
                padding: [50, 50]
            }
        );

    }

}


/* =====================================================
   DASHBOARD
===================================================== */

function updateDashboard(

    predictions,

    latitude,

    longitude,

    widthKm,

    heightKm,

    date

) {


    const count =
        predictions.length;


    const patches =
        count === 0
            ? 0
            : Math.max(
                1,
                Math.ceil(
                    count / 3
                )
            );


    const footprintArea =
        widthKm *
        heightKm;


    let debrisArea =
        0;


    let confidenceTotal =
        0;


    predictions.forEach(
        function (item) {

            const bbox =
                item.bbox || [];


            const width =
                Number(
                    bbox[2]
                ) || 0;


            const height =
                Number(
                    bbox[3]
                ) || 0;


            const pixelArea =
                width *
                height;


            const fraction =
                pixelArea /
                (
                    960 *
                    960
                );


            debrisArea +=
                fraction *
                footprintArea *
                1000000;


            confidenceTotal +=
                Number(
                    item.score
                ) || 0;

        }
    );


    const averageConfidence =
        count
            ? confidenceTotal /
              count
            : 0;


    const density =
        footprintArea > 0
            ? count /
              footprintArea
            : 0;


    let overallPriority =
        "LOW";


    if (
        averageConfidence >=
            0.85 ||
        count >= 10
    ) {

        overallPriority =
            "HIGH";

    } else if (
        averageConfidence >=
            0.75 ||
        count >= 5
    ) {

        overallPriority =
            "MEDIUM";

    }


    document.getElementById(
        "metricDetected"
    ).textContent =
        count;


    document.getElementById(
        "metricPatches"
    ).textContent =
        patches;


    document.getElementById(
        "metricArea"
    ).textContent =
        `${debrisArea.toFixed(1)} m²`;


    document.getElementById(
        "metricDensity"
    ).textContent =
        `${density.toFixed(2)} / km²`;


    document.getElementById(
        "metricConfidence"
    ).textContent =
        `${(
            averageConfidence *
            100
        ).toFixed(1)}%`;


    const priorityElement =
        document.getElementById(
            "metricPriority"
        );


    priorityElement.textContent =
        overallPriority;


    priorityElement.style.color =
        overallPriority === "HIGH"
            ? "#dc2626"
            : overallPriority === "MEDIUM"
                ? "#f59e0b"
                : "#16a34a";


    document.getElementById(
        "metricCoordinates"
    ).textContent =
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;


    document.getElementById(
        "metricTimestamp"
    ).textContent =
        date ||
        new Date().toLocaleString();


    displayDetectionList(
        predictions
    );

}


/* =====================================================
   DETECTION LIST
===================================================== */

function displayDetectionList(
    predictions
) {


    const container =
        document.getElementById(
            "detectionList"
        );


    if (
        predictions.length === 0
    ) {

        container.innerHTML = `
            <div class="status-message">
                No debris objects detected above
                the model confidence threshold.
            </div>
        `;

        return;

    }


    container.innerHTML =
        predictions
            .map(
                function (
                    item,
                    index
                ) {

                    const confidence =
                        Number(
                            item.score
                        );


                    const priority =
                        calculatePriority(

                            confidence,

                            Number(
                                item.bbox[2]
                            ),

                            Number(
                                item.bbox[3]
                            )

                        );


                    return `

                        <div class="detection-row">

                            <div>

                                <strong>
                                    Detection #${index + 1}
                                </strong>

                                <br>

                                ${escapeHTML(
                                    item.class ||
                                    "Floating plastic debris"
                                )}

                            </div>


                            <div>

                                <span class="priority ${priority.toLowerCase()}">

                                    ${priority}

                                </span>

                                <br>

                                ${(
                                    confidence *
                                    100
                                ).toFixed(1)}%
                                confidence

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


/* =====================================================
   GEOJSON DISPLAY
===================================================== */

function displayGeoJSON(
    geojson
) {

    document.getElementById(
        "geojsonOutput"
    ).textContent =
        JSON.stringify(
            geojson,
            null,
            2
        );

}


/* =====================================================
   DOWNLOAD GEOJSON
===================================================== */

function downloadGeoJSON() {

    if (
        !currentGeoJSON
    ) {

        alert(
            "Run an image analysis first."
        );

        return;

    }


    const blob =
        new Blob(

            [
                JSON.stringify(
                    currentGeoJSON,
                    null,
                    2
                )
            ],

            {
                type:
                    "application/geo+json"
            }

        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href = url;

    link.download =
        "bluealert-debris.geojson";


    link.click();


    URL.revokeObjectURL(
        url
    );

}


/* =====================================================
   DRIFT SIMULATION
===================================================== */

function simulateDrift() {

    if (
        !currentGeoJSON ||
        !currentGeoJSON.features.length
    ) {

        setDriftStatus(
            "Analyze an image first so that debris coordinates are available.",
            true
        );

        return;

    }


    const windSpeed =
        Number(
            document.getElementById(
                "windSpeed"
            ).value
        );


    const windDirection =
        Number(
            document.getElementById(
                "windDirection"
            ).value
        );


    const currentSpeed =
        Number(
            document.getElementById(
                "currentSpeed"
            ).value
        );


    const currentDirection =
        Number(
            document.getElementById(
                "currentDirection"
            ).value
        );


    const hours =
        Number(
            document.getElementById(
                "driftHours"
            ).value
        );


    if (
        !Number.isFinite(
            windSpeed
        ) ||
        !Number.isFinite(
            currentSpeed
        ) ||
        !Number.isFinite(
            hours
        )
    ) {

        setDriftStatus(
            "Enter valid drift values.",
            true
        );

        return;

    }


    const start =
        currentGeoJSON
            .features[0]
            .geometry
            .coordinates;


    let lon =
        Number(
            start[0]
        );


    let lat =
        Number(
            start[1]
        );


    const points = [

        [
            lat,
            lon
        ]

    ];


    /*
       Simplified vector model.

       Current contribution:
       100%

       Wind contribution:
       3%

       This is a prototype only.
    */


    const currentContribution =
        currentSpeed;


    const windContribution =
        windSpeed * 0.03;


    const currentRad =
        currentDirection *
        Math.PI /
        180;


    const windRad =
        windDirection *
        Math.PI /
        180;


    for (
        let hour = 0;
        hour < hours;
        hour++
    ) {


        const eastVelocity =

            currentContribution *
            Math.sin(
                currentRad
            )

            +

            windContribution *
            Math.sin(
                windRad
            );


        const northVelocity =

            currentContribution *
            Math.cos(
                currentRad
            )

            +

            windContribution *
            Math.cos(
                windRad
            );


        const eastKm =
            eastVelocity;


        const northKm =
            northVelocity;


        lat +=
            northKm /
            111;


        lon +=
            eastKm /
            (
                111 *
                Math.cos(
                    lat *
                    Math.PI /
                    180
                )
            );


        points.push([
            lat,
            lon
        ]);

    }


    if (
        driftLayer
    ) {

        map.removeLayer(
            driftLayer
        );

    }


    driftLayer =
        L.polyline(

            points,

            {

                color:
                    "#7c3aed",

                weight: 4,

                dashArray:
                    "8 8"

            }

        ).addTo(map);


    const endpoint =
        points[
            points.length - 1
        ];


    L.circleMarker(

        endpoint,

        {

            radius: 9,

            color:
                "#7c3aed",

            fillColor:
                "#a78bfa",

            fillOpacity: 1

        }

    )

        .addTo(driftLayer);


    map.fitBounds(
        driftLayer.getBounds(),
        {
            padding: [50, 50]
        }
    );


    setDriftStatus(

        `Indicative drift after ${hours} hours: ` +

        `${endpoint[0].toFixed(4)}°, ` +

        `${endpoint[1].toFixed(4)}°. ` +

        `This is a prototype vector simulation.`

    );

}


/* =====================================================
   CLEAR MAP
===================================================== */

function clearMapLayers() {

    if (
        imageLayer
    ) {

        map.removeLayer(
            imageLayer
        );

        imageLayer = null;

    }


    if (
        detectionLayer
    ) {

        map.removeLayer(
            detectionLayer
        );

        detectionLayer = null;

    }


    if (
        driftLayer
    ) {

        map.removeLayer(
            driftLayer
        );

        driftLayer = null;

    }

}


/* =====================================================
   CLEAR EVERYTHING
===================================================== */

function clearAnalysis() {

    clearMapLayers();


    currentGeoJSON = null;

    lastAnalysis = null;


    document.getElementById(
        "metricDetected"
    ).textContent = "0";


    document.getElementById(
        "metricPatches"
    ).textContent = "0";


    document.getElementById(
        "metricArea"
    ).textContent = "0 m²";


    document.getElementById(
        "metricDensity"
    ).textContent = "0 / km²";


    document.getElementById(
        "metricConfidence"
    ).textContent = "0%";


    document.getElementById(
        "metricPriority"
    ).textContent = "—";


    document.getElementById(
        "metricCoordinates"
    ).textContent = "—";


    document.getElementById(
        "metricTimestamp"
    ).textContent = "—";


    document.getElementById(
        "detectionList"
    ).textContent =
        "No analysis performed yet.";


    document.getElementById(
        "geojsonOutput"
    ).textContent =
        "No GeoJSON generated yet.";


    setStatus(
        "Analysis cleared."
    );

}


/* =====================================================
   HELPERS
===================================================== */

function clamp(
    value,
    min,
    max
) {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );

}


function escapeHTML(
    value
) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


function setStatus(
    message,
    error = false
) {

    const element =
        document.getElementById(
            "analysisStatus"
        );


    element.textContent =
        message;


    element.style.background =
        error
            ? "#fee2e2"
            : "#f0f9ff";


    element.style.color =
        error
            ? "#991b1b"
            : "#075985";

}


function setDriftStatus(
    message,
    error = false
) {

    const element =
        document.getElementById(
            "driftStatus"
        );


    element.textContent =
        message;


    element.style.background =
        error
            ? "#fee2e2"
            : "#f5f3ff";


    element.style.color =
        error
            ? "#991b1b"
            : "#5b21b6";

}