const request = require("phin");
const http = require('http');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ limit: '1gb', extended: true }));
app.use(bodyParser.json());

// STATIC VALUES
const staticValues = {
    campDetail: {
        campid: "BAB35AD7CF58F4F0",
        roof_shade: "No Shade",
        solar_electric: "TRUE",
        property_ownership: "OWN",
        credit_rating: "Good",
    },
    voiceSend: {
        body: "Hi, this is a test from Neel's machine.",
        lang: "en-us",
        voice: "female",
        machine_detection: 1
    },
    delay: {
        time: 25000 // 25 second
    }
};

// STATIC ERROR MESSAGES
const staticError = {
    ERR_INVALID_INPUT: {
        code: 400, outcome: "Please provide valid input."
    },
    ERR_INTERNAL_SERVER_ERROR: {
        code: 500, outcome: "Internal server error!"
    },
    ERR_URL_NOT_FOUND: {
        code: 404, outcome: "Page not found"
    },
    ERR_GENRIC_SYNTAX: {
        code: 400, outcome: "JSON request could not parsed"
    },
    ERR_LEAD_FAILED: {
        code: 400, outcome:"Lead Failed - AMD"
    },
    ERR_LEAD_FAILED_CLIENT: {
        code: 400, outcome:"Lead Failed - Client"
    }
}

// Catch JSON error
app.use((error, req, res, next) => {
    if (error) {
        return res.status(staticValues.ERR_GENRIC_SYNTAX.code).json(staticValues.ERR_GENRIC_SYNTAX);
    }
    next();
});
app.use(bodyParser.json({ limit: '1gb' }));

const port = 40200
http.createServer(app).listen(port, () => {
    console.log(`Express server listening on port ${port}`);
});

// MAIN API
const callVerification = async (req, res) => {
    try {
        await step1(req);
        return res.status(200).json({ outcome:"Lead Accepted" });
    } catch (err) {
        console.log("Error from callVerification", err);
        return res.status(err.code).json({ outcome: err.outcome });
    }
}

// It's used to call third party API's
const callAPI = async (obj) => {
    try {
        const { url, method, data, headers } = obj;
        const options = {
            url,
            method,
            data,
            headers
        };
        const result = await request(options);
        const response = result && result.body ? JSON.parse(result.body.toString()) : {};
        if (result.statusCode === 200) {
            return response;
        } else {
            const errorObj = {
                code: result.statusCode,
                outcome: response.message || response.error || "Internal server error",
            };
            throw errorObj;
        }
    } catch (err) {
        console.log(err);
        const errorObj = {
            code: err.statusCode || err.code || 500,
            outcome: err.error || "Internal server error",
        };
        throw errorObj;
    }
}

// It's used to put delay after step1
const delay = async () => {
    await new Promise(resolve => setTimeout(resolve, staticValues.delay.time));
}

// It's used to send a voice call
const step1 = async (obj) => {
    try {
        const { body, headers } = obj;
        const { to } = body;
        const user = {
            first_name: body.first_name || "",
            last_name: body.last_name || "",
            street: body.street || "",
            city: body.city || "",
            state: body.state || "",
            zip: body.zip || "",
            email: body.email || "",
            phone_home: body.phone_home || "",
            electric_bill: body.electric_bill || "",
            electricUtilityProviderText: body.electricUtilityProviderText || "",
            ip_address: body.ip_address || "",
            universal_leadid: body.universal_leadid || "",
            xxTrustedFormCertUrl: body.xxTrustedFormCertUrl || "",
            s1: body.s1 || "",
            s2: body.s2 || "",
            s3: body.s3 || "",
        };
        const { token } = headers;
        if (!token || !to || typeof to !== 'string') {
            throw staticError.ERR_INVALID_INPUT;
        }
        if (!user || typeof user !== 'object' || Array.isArray(user)) {
            throw staticError.ERR_INVALID_INPUT;
        }
        const requestInfo = {
            url: "https://rest.clicksend.com/v3/voice/send",
            method: "POST",
            data: {
                messages: [
                    {
                        to,
                        ...staticValues.voiceSend
                    }
                ],
                cee: [{ ...user }]
            },
            headers: {
                Authorization: `Basic ${token}`
            }
        };
        const result = await callAPI(requestInfo);
        if (result.http_code === 200) {
            const date_added = result.data.messages[0].date_added;
            await delay();
            return await step2({ token, date_added, user });
        }
        throw staticError.ERR_LEAD_FAILED;
    } catch (err) {
        console.log("Error from step1", err);
        throw err;
    }
}

// It's used to get call history
const step2 = async (obj) => {
    try {
        const { token, date_added, user } = obj;
        const requestInfo = {
            url: `https://rest.clicksend.com/v3/voice/history?date_from=${date_added}&date_to=${date_added}`,
            method: "GET",
            data: {},
            headers: {
                Authorization: `Basic ${token}`
            }
        };
        const result = await callAPI(requestInfo);
        if (result.http_code === 200) {
            const historyDetail = result.data.data[0];
            const { status, machine_detected } = historyDetail;
            if (status === "Sent" && machine_detected === 0) {
                return await step3({ token, user });
            }
            throw staticError.ERR_LEAD_FAILED;
        }
        throw staticError.ERR_LEAD_FAILED;
    } catch (err) {
        console.log("Error from step2", err);
        throw err;
    }
}

// It's used to post campaign data
const step3 = async (obj) => {
    try {
        const { token, user } = obj;
        const postData = {
            ...user,
            campid: staticValues.campDetail.campid,
            roof_shade: staticValues.campDetail.roof_shade,
            solar_electric: staticValues.campDetail.solar_electric,
            property_ownership: staticValues.campDetail.property_ownership,
            credit_rating: staticValues.campDetail.credit_rating,
        };
        const requestInfo = {
            url: "http://receiver.ceeleads.info/leads/post2",
            method: "POST",
            data: postData,
            headers: {
                Authorization: `Basic ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': JSON.stringify(postData).length
            }
        };
        const result = await callAPI(requestInfo);
        console.log("result", result);
        if (result.status && result.status === "POST_VALID") {
            return result
        }
        throw staticError.ERR_LEAD_FAILED;
    } catch (err) {
        console.log("Error from step3", err);
        throw staticError.ERR_LEAD_FAILED_CLIENT;
    }
}

// API's 
app.post('/callVerification', callVerification);

// Error handling
app.all('/*', (req, res) => {
    return res.status(staticError.ERR_URL_NOT_FOUND.code).json(staticError.ERR_URL_NOT_FOUND);
});
