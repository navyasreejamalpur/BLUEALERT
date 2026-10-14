const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();
const PORT = 3000;

const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(__dirname, "uploads");
const pythonScript = path.join(__dirname, "analyze_plastic.py");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadDir));


// ======================================================
// MULTER UPLOAD CONFIGURATION
// ======================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const name =
            "satellite_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 8) +
            ext;

        cb(null, name);
    }
});


const upload = multer({
    storage: storage,

    limits: {
        fileSize: 25 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
            ".tif",
            ".tiff"
        ];

        const extension =
            path.extname(file.originalname).toLowerCase();

        console.log("------------------------------------------------");
        console.log("Uploaded file:", file.originalname);
        console.log("MIME type:", file.mimetype);
        console.log("Extension:", extension);
        console.log("------------------------------------------------");

        // Check extension
        if (allowedExtensions.includes(extension)) {
            return cb(null, true);
        }

        return cb(
            new Error(
                "Unsupported image extension: " +
                extension +
                ". Please use JPG, JPEG, PNG, WEBP, TIF or TIFF."
            )
        );
    }
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {

    res.json({
        status: "ok",
        message: "BlueAlert server is running"
    });

});


// ======================================================
// TEST PAGE
// ======================================================

app.get("/test", (req, res) => {

    res.send(`
        <h1>BlueAlert Server Working</h1>
        <p>Server is running correctly.</p>
    `);

});


// ======================================================
// AI ANALYSIS
// ======================================================

app.post(
    "/api/analyze",
    upload.single("satelliteImage"),

    async (req, res) => {

        console.log("\n==============================================");
        console.log("NEW ANALYSIS REQUEST");
        console.log("==============================================");

        try {

            // ------------------------------------------------
            // CHECK IMAGE
            // ------------------------------------------------

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "No image uploaded."
                });

            }

            console.log("Image received:");
            console.log("Original name:", req.file.originalname);
            console.log("Saved name:", req.file.filename);
            console.log("Saved path:", req.file.path);
            console.log("MIME:", req.file.mimetype);


            // ------------------------------------------------
            // READ FORM VALUES
            // ------------------------------------------------

            console.log("\nReceived form data:");
            console.log(req.body);


            // Support multiple possible field names

            const latitudeValue =
                req.body.latitude ??
                req.body.lat ??
                req.body.centerLat;

            const longitudeValue =
                req.body.longitude ??
                req.body.lon ??
                req.body.lng ??
                req.body.centerLon;

            const widthValue =
                req.body.footprintWidth ??
                req.body.width ??
                req.body.imageWidth;

            const heightValue =
                req.body.footprintHeight ??
                req.body.height ??
                req.body.imageHeight;

            const imageDate =
                req.body.imageDate ??
                req.body.date ??
                "";


            // ------------------------------------------------
            // CONVERT VALUES TO NUMBERS
            // ------------------------------------------------

            const latitude =
                Number.parseFloat(latitudeValue);

            const longitude =
                Number.parseFloat(longitudeValue);

            let footprintWidth =
                Number.parseFloat(widthValue);

            let footprintHeight =
                Number.parseFloat(heightValue);


            console.log("\nParsed values:");
            console.log("Latitude:", latitude);
            console.log("Longitude:", longitude);
            console.log("Width:", footprintWidth);
            console.log("Height:", footprintHeight);
            console.log("Date:", imageDate);


            // ------------------------------------------------
            // DEFAULT FOOTPRINT
            // ------------------------------------------------
            // If the frontend sends empty width/height,
            // use 1 km × 1 km for the hackathon prototype.

            if (
                !Number.isFinite(footprintWidth) ||
                footprintWidth <= 0
            ) {
                console.log(
                    "Width missing/invalid -> using 1 km"
                );

                footprintWidth = 1;
            }

            if (
                !Number.isFinite(footprintHeight) ||
                footprintHeight <= 0
            ) {
                console.log(
                    "Height missing/invalid -> using 1 km"
                );

                footprintHeight = 1;
            }


            // ------------------------------------------------
            // DEFAULT CENTER
            // ------------------------------------------------

            const finalLatitude =
                Number.isFinite(latitude)
                    ? latitude
                    : 0;

            const finalLongitude =
                Number.isFinite(longitude)
                    ? longitude
                    : 0;


            // ------------------------------------------------
            // VALIDATE LAT/LON
            // ------------------------------------------------

            if (
                finalLatitude < -90 ||
                finalLatitude > 90
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Latitude must be between -90 and 90."
                });

            }

            if (
                finalLongitude < -180 ||
                finalLongitude > 180
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Longitude must be between -180 and 180."
                });

            }


            // ------------------------------------------------
            // CHECK PYTHON FILE
            // ------------------------------------------------

            if (!fs.existsSync(pythonScript)) {

                return res.status(500).json({
                    success: false,
                    error:
                        "analyze_plastic.py was not found.",
                    path: pythonScript
                });

            }


            // ------------------------------------------------
            // RUN PYTHON AI MODEL
            // ------------------------------------------------

            console.log("\nStarting AI analysis...");

            const pythonCommand =
                process.env.PYTHON_COMMAND || "python";

            execFile(
                pythonCommand,

                [
                    pythonScript,
                    req.file.path
                ],

                {
                    maxBuffer: 20 * 1024 * 1024
                },

                (error, stdout, stderr) => {

                    console.log("\n========== PYTHON OUTPUT ==========");

                    console.log("STDOUT:");
                    console.log(stdout);

                    console.log("STDERR:");
                    console.log(stderr);

                    console.log("===================================\n");


                    // ------------------------------------------------
                    // PYTHON ERROR
                    // ------------------------------------------------

                    if (error) {

                        console.error(
                            "Python execution failed:"
                        );

                        console.error(error);

                        return res.status(500).json({

                            success: false,

                            error:
                                "AI analysis failed.",

                            details:
                                stderr ||
                                stdout ||
                                error.message
                        });

                    }


                    // ------------------------------------------------
                    // PARSE PYTHON JSON
                    // ------------------------------------------------

                    let aiResult;

try {
    const lines = stdout
        .trim()
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");

    // Python prints YOLO messages first and JSON last
    const jsonLine = lines[lines.length - 1];

    aiResult = JSON.parse(jsonLine);

} catch (parseError) {
    return res.status(500).json({
        success: false,
        error: "AI model returned invalid data.",
        details: stdout || stderr || parseError.message
    });
}


                    // ------------------------------------------------
                    // GET IMAGE SIZE
                    // ------------------------------------------------

                    const imageWidth =
                        Number(aiResult.image_width);

                    const imageHeight =
                        Number(aiResult.image_height);


                    if (
                        !Number.isFinite(imageWidth) ||
                        !Number.isFinite(imageHeight) ||
                        imageWidth <= 0 ||
                        imageHeight <= 0
                    ) {

                        return res.status(500).json({

                            success: false,

                            error:
                                "AI model did not return valid image dimensions."
                        });

                    }


                    // ------------------------------------------------
                    // GET PREDICTIONS
                    // ------------------------------------------------

                    const predictions =
                        Array.isArray(aiResult.predictions)
                            ? aiResult.predictions
                            : [];


                    console.log(
                        "Detected objects:",
                        predictions.length
                    );


                    // ------------------------------------------------
                    // GEOJSON FEATURES
                    // ------------------------------------------------

                    const features = [];


                    // Latitude conversion
                    const kmPerDegreeLat = 111.32;

                    // Longitude conversion
                    const kmPerDegreeLon =
                        111.32 *
                        Math.cos(
                            finalLatitude *
                            Math.PI /
                            180
                        );


                    predictions.forEach(
                        (prediction, index) => {

                            const bbox =
                                prediction.bbox;

                            if (
                                !Array.isArray(bbox) ||
                                bbox.length < 4
                            ) {
                                return;
                            }


                            const x =
                                Number(bbox[0]);

                            const y =
                                Number(bbox[1]);

                            const width =
                                Number(bbox[2]);

                            const height =
                                Number(bbox[3]);


                            if (
                                !Number.isFinite(x) ||
                                !Number.isFinite(y)
                            ) {
                                return;
                            }


                            // Center of detected bounding box

                            const centerX =
                                x + width / 2;

                            const centerY =
                                y + height / 2;


                            // Convert pixels to km

                            const kmX =
                                (
                                    centerX /
                                    imageWidth -
                                    0.5
                                ) *
                                footprintWidth;


                            const kmY =
                                (
                                    0.5 -
                                    centerY /
                                    imageHeight
                                ) *
                                footprintHeight;


                            // Convert km to degrees

                            const lat =
                                finalLatitude +
                                kmY /
                                kmPerDegreeLat;


                            const lon =
                                finalLongitude +
                                kmX /
                                kmPerDegreeLon;


                            // Confidence

                            const confidence =
                                Number(
                                    prediction.score ??
                                    prediction.confidence ??
                                    0
                                );


                            // Simple prototype priority

                            let priority =
                                "low";

                            if (
                                confidence >= 0.85
                            ) {

                                priority = "high";

                            } else if (
                                confidence >= 0.70
                            ) {

                                priority = "medium";

                            }


                            features.push({

                                type: "Feature",

                                geometry: {

                                    type: "Point",

                                    coordinates: [
                                        lon,
                                        lat
                                    ]

                                },

                                properties: {

                                    id:
                                        "debris-" +
                                        (index + 1),

                                    class:
                                        prediction.class ??
                                        "Floating plastic litter",

                                    confidence:
                                        Number(
                                            confidence.toFixed(3)
                                        ),

                                    priority:
                                        priority
                                }

                            });

                        }
                    );


                    // ------------------------------------------------
                    // GEOJSON
                    // ------------------------------------------------

                    const geojson = {

                        type:
                            "FeatureCollection",

                        features:
                            features

                    };


                    // ------------------------------------------------
                    // STATISTICS
                    // ------------------------------------------------

                    const confidenceValues =
                        features
                            .map(
                                f =>
                                    Number(
                                        f.properties.confidence
                                    )
                            )
                            .filter(
                                n =>
                                    Number.isFinite(n)
                            );


                    const averageConfidence =
                        confidenceValues.length > 0

                            ? confidenceValues.reduce(
                                (a, b) =>
                                    a + b,
                                0
                            ) /
                            confidenceValues.length

                            : 0;


                    const highCount =
                        features.filter(
                            f =>
                                f.properties.priority ===
                                "high"
                        ).length;


                    const mediumCount =
                        features.filter(
                            f =>
                                f.properties.priority ===
                                "medium"
                        ).length;


                    const lowCount =
                        features.filter(
                            f =>
                                f.properties.priority ===
                                "low"
                        ).length;


                    // ------------------------------------------------
                    // FINAL RESPONSE
                    // ------------------------------------------------

                    return res.json({

                        success: true,

                        message:
                            "AI analysis completed successfully.",

                        image: {

                            filename:
                                req.file.filename,

                            originalName:
                                req.file.originalname,

                            url:
                                "/uploads/" +
                                req.file.filename,

                            width:
                                imageWidth,

                            height:
                                imageHeight

                        },

                        location: {

                            latitude:
                                finalLatitude,

                            longitude:
                                finalLongitude

                        },

                        footprint: {

                            widthKm:
                                footprintWidth,

                            heightKm:
                                footprintHeight

                        },

                        imageDate:
                            imageDate,

                        statistics: {

                            detectedItems:
                                features.length,

                            highPriority:
                                highCount,

                            mediumPriority:
                                mediumCount,

                            lowPriority:
                                lowCount,

                            averageConfidence:
                                Number(
                                    averageConfidence.toFixed(3)
                                ),

                            footprintAreaKm2:
                                Number(
                                    (
                                        footprintWidth *
                                        footprintHeight
                                    ).toFixed(3)
                                )

                        },

                        geojson:
                            geojson

                    });

                }
            );

        } catch (error) {

            console.error(
                "SERVER ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Server error.",

                details:
                    error.message

            });

        }

    }
);


// ======================================================
// MULTER / SERVER ERROR HANDLER
// ======================================================

app.use(
    (err, req, res, next) => {

        console.error(
            "\nUPLOAD/SERVER ERROR:"
        );

        console.error(err);


        if (
            err instanceof multer.MulterError
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "File upload error.",

                details:
                    err.message

            });

        }


        if (err) {

            return res.status(400).json({

                success: false,

                error:
                    err.message ||
                    "Unknown server error."

            });

        }


        next();

    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            "=============================================="
        );

        console.log(
            "BlueAlert server running at:"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "=============================================="
        );

    }
);