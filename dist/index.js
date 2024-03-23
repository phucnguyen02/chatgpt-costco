var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { initializeFirebaseApp, getAllStations } = require("./firebase");
const { OpenAI } = require("openai");
const { Client } = require("@googlemaps/google-maps-services-js");
require('dotenv').config();
const openai = new OpenAI({
    apiKey: process.env.CHATGPT_API_KEY
});
const googleMapsClient = new Client({});
const app = express();
app.use(bodyParser.json());
app.use(cors());
initializeFirebaseApp();
// ChatGPT endpoint
app.post("/chat", (req, res) => __awaiter(this, void 0, void 0, function* () {
    const body = req.body;
    let prompt = body.prompt;
    let warehouseList = yield getAllStations();
    const args = {
        params: {
            key: process.env.GOOGLE_MAPS_API_KEY,
            address: body.address
        }
    };
    googleMapsClient.geocode(args).then(gcResponse => {
        const str = JSON.stringify(gcResponse.data.results[0].formatted_address);
        console.log(`First result is: ${str}`);
    });
    let checkMessageType = `Given the following prompt: ${prompt}, please assign it a value to the type of request
    it is the closest to. Here are the values: 1 is finding the nearest cheapest gas station, 2 is finding the
    appropriate gas type for a car brand, 3 is getting gas trends for a week, 4 is unknown request (use 4 if the
    prompt doesn't fall into the previous 3 categories). Give me a response with a JSON format with the following field: Message_Type.
    If it's type 2, please add an extra field Car_Brand into the response that retrieves the car brand from the prompt.`;
    let chatCompletion = yield openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ "role": "user", "content": checkMessageType }],
    });
    console.log(chatCompletion.choices[0].message.content);
    let messageContent;
    let messageType = parseInt(JSON.parse(chatCompletion.choices[0].message.content).Message_Type);
    console.log(messageType);
    if (messageType == 4) {
        let errorResponse = { "error": "Invalid Request" };
        res.send(errorResponse);
    }
    else {
        switch (messageType) {
            // Find nearest, cheapest gas station
            case 1:
                let address = body.address;
                messageContent = `I am a user who is trying to refuel their car. My current location is ${address}. You are an advanced search \
                engine, give me the cheapest Costco gas station that's closest to me and calculate the distance. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                Please give me a response with a JSON format with the following fields: a JSON object with the field Warehouse_Info containing the following fields:
                Station_Name, Address, City, State, Approximate_Distance, Regular_Gas, Premium_Gas, and the 2nd field named Prompt_Response being a user-friendly message containing all
                of the necessary information about that warehouse using all the information from the Warehouse_Info field.  
                Also, make sure Station_Name matches exactly the name that was provided in the list of stations.`;
                break;
            // Find appropriate gas type
            case 2:
                let carBrand = chatCompletion.choices[0].message.content.Car_Brand;
                messageContent = `I am a user who is trying to refuel their car. My current address is ${address}. My current car brand is ${carBrand}. 
                You are an advanced search engine, give me the appropriate gas type for my car and a
                nearby Costco gas station so I can refuel. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                Please give me a response with a JSON format with the following fields: a JSON object with the field Warehouse_Info containing the following fields: 
                Station_Name, Address, City, State, Recommended_Gas, Gas_Price, and the 2nd field named Prompt_Response being a user-friendly message containing all
                of the necessary information about that warehouse using all the information from the Warehouse_Info field.  
                Also, make sure Station_Name matches exactly the name that was provided in the list of stations. Gas_Price should be the corresponding price of the recommended gas type.`;
                break;
            // Get gas trends, mermaidJS chart?
            case 3:
                messageContent = `I am a user in Orange County who would like to know about the trend of gas prices in this region. You are an advanced search \
                engine, generate all of the gas prices for all the Costco gas stations within the past week. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                Please give me a response with a JSON format with the following fields: Station_Name, Address, City, State, Gas_Trend.
                Also, make sure Station_Name matches exactly the name that was provided in the list of stations.`;
                break;
        }
        chatCompletion = yield openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ "role": "user", "content": messageContent }],
        });
        console.log(chatCompletion.choices[0].message.content);
        res.send(chatCompletion.choices[0].message.content);
    }
}));
const port = 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
