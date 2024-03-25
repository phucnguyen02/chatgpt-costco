const express = require("express");
const cors = require("cors");
import bodyParser from "body-parser";
import { initializeFirebaseApp, getAllStations } from "./firebase";
const { OpenAI } = require("openai");
import { Client } from "@googlemaps/google-maps-services-js";
import axios from "axios";

import {
    Document,
    storageContextFromDefaults,
    FunctionTool,
    OpenAIAgent,
    SummaryIndex,
    serviceContextFromDefaults,
    SimpleNodeParser,
    QueryEngineTool
} from "llamaindex";
import { Agent } from "http";


require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.CHATGPT_API_KEY 
});

const googleMapsClient = new Client({});

const distanceCalc = async ({origin, destination}) => {
    try{
        origin = encodeURIComponent(origin.trim())
        destination = encodeURIComponent(destination.trim())
        let url = `https://maps.googleapis.com/maps/api/distancematrix/json?destinations=${destination}&origins=${origin}&units=imperial&key=${process.env.GOOGLE_MAPS_API_KEY}`
        const response = await axios.get(url);
        return response.data.rows[0].elements[0].distance.text;
    }
    catch (err){
        console.log(err);
        return "";
    }
}

const minimumDist = (warehouseDistances) => {
    let minimumDist = Infinity;
    let warehouseResult = "";
    for(let i = 0; i<warehouseDistances.length; i++){
        if(minimumDist < Number(warehouseDistances[i].Distance)){
            minimumDist = Number(warehouseDistances[i].Distance);
            warehouseResult = warehouseDistances[i];
        }
    }
    return warehouseResult;
}

const getDocuments = (warehouseList) => {
    let documents = [];
    for(let i = 0; i < warehouseList.length; i++){
        let current = warehouseList[i];
        let warehouseMetadata = `This warehouse's name is ${current.Name}. Its regular gas price today is ${current.Regular_Gas}, premium gas price today
        is ${current.Premium_Gas}. Its address is ${current.Address}, ${current.City}, ${current.State}`;
        let document = new Document({text: warehouseMetadata, id_: i.toString()});
        documents.push(document);
    }
    return documents;
}

const distanceJSON = {
    type: "object",
    properties: {
        origin: {
            type: "string",
            description: "The origin address",
        },
        destination: {
            type: "string",
            description: "The destination address",
        },
    },
    required: ["origin", "destination"],

}

const minDistJSON = {
    type: "object",
    properties: {
        warehouseList: {
            type: "array",
            description: "The array of warehouses and their distances from the current address. Each element of the array \
            consists of the warehouse name as Warehouse_Name, and the distance as Distance.",
            items: {
                type: "object", 
                properties: {
                    Warehouse_Name: {
                        type: "string",
                        description: "The name of the warehouse"
                    },
                    Distance: {
                        type: "string",
                        description: "The distance between it and the provided address in miles"
                    }
                },
                required: ["Warehouse_Name", "Distance"]
            }
        }
    },
    required: ["warehouseList"],
}

const app = express();
app.use(bodyParser.json());
app.use(cors());

initializeFirebaseApp();

// ChatGPT endpoint
app.post("/chat", async (req, res) => {
    const body = req.body;
    let prompt = body.prompt;
    let warehouseList = await getAllStations();
    let documents = getDocuments(warehouseList);
    
    const storageContext = await storageContextFromDefaults({
        persistDir: "./storage",
    });
    const serviceContext = serviceContextFromDefaults({
        nodeParser: new SimpleNodeParser({
          chunkSize: 40,
        }),
    });

    // res.send(storageContext.docStore);
    // const index = await SummaryIndex.fromDocuments(documents, {
    //     storageContext, serviceContext
    // });
    const loadedIndex = await SummaryIndex.init({
        storageContext: storageContext,
      });
    const loadedQueryEngine = loadedIndex.asQueryEngine();

    const queryEngineTool = new QueryEngineTool({
        queryEngine: loadedQueryEngine,
        metadata: {
          name: "Loaded_query_engine",
          description: "A query engine for the Costco warehouses. The documents contain the warehouses' names, gas prices, and addresses.",
        },
      });

    // const loadedResponse = await loadedQueryEngine.query({
    //     query: "Name all of the provided Costco warehouses along with their regular and premium gas prices separately",
    // });
    // res.send(loadedResponse.toString());
    // return;
    let checkMessageType = `Given the following prompt: ${prompt}, please assign it a value to the type of request
    it is the closest to. Here are the values: 1 is finding the nearest cheapest gas station, 2 is finding the
    appropriate gas type for a car brand, 3 is getting gas trends for a week, 4 is unknown request (use 4 if the
    prompt doesn't fall into the previous 3 categories). Give me a response with a JSON format with the following field: Message_Type.
    If it's type 2, please add an extra field Car_Brand into the response that retrieves the car brand from the prompt.`

    let chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{"role": "user", "content": checkMessageType}],
    });

    const distanceFunctionTool = new FunctionTool(distanceCalc, {
        name: "distanceCalc",
        description: "Use this function to calculate the distance between 2 given addresses. The origin and destination parameters should be 2 separate strings",
        parameters: distanceJSON
    })

    const minDistFunctionTool = new FunctionTool(minimumDist, {
        name: "minimumDist",
        description: "Use this function to retrieve the warehouse with the smallest distance",
        parameters: minDistJSON
    });

    const agent = new OpenAIAgent({
        tools: [distanceFunctionTool, minDistFunctionTool, queryEngineTool],
        verbose: true
    });
    let minWarehouseDist = await agent.chat({
        // message: `Calculate the closest warehouse among the list of warehouses to ${body.address}`
        //message: `List out of all of the warehouse addresses and their distances to ${body.address}`
        message: `Name all of the provided Costco warehouses along with their regular and premium gas prices separately`
    })
    res.send(minWarehouseDist)
    return;
    let messageContent;
    let firstResponse = chatCompletion.choices[0].message.content;
    let messageType = parseInt(JSON.parse(firstResponse).Message_Type);

    if(messageType == 4){
        let errorResponse = {"error": "Invalid Request"};
        res.send(errorResponse);
    }
    else{
        switch(messageType){
            // Find nearest, cheapest gas station
            case 1:
                let address = body.address;
                const distanceFunctionTool = new FunctionTool(distanceCalc, {
                    name: "distanceCalc",
                    description: "Use this function to calculate the distance between 2 given addresses. The origin and destination parameters should be 2 separate strings",
                    parameters: distanceJSON
                })

                const minDistFunctionTool = new FunctionTool(minimumDist, {
                    name: "minimumDist",
                    description: "Use this function to retrieve the warehouse with the smallest distance",
                    parameters: minDistJSON
                });
            
                const agent = new OpenAIAgent({
                    tools: [distanceFunctionTool, minDistFunctionTool],
                    verbose: true
                });
            
                let distances = [];
                // for(let i = 0; i < warehouseList.length; i++){
                //     let current = warehouseList[i];
                //     let warehouseAddress = `${current.Address}, ${current.City}, ${current.State}`
                //     let warehouseDistance = await agent.chat({
                //         message: `What is the distance between ${address} and ${warehouseAddress}?`
                //     })
                //     distances.push({"Warehouse_Name": current.Name, "Distance": warehouseDistance});
                // }


                // messageContent = `I am a user who is trying to refuel their car. My current location is ${address}. You are an advanced search \
                // engine, give me the cheapest Costco gas station that's closest to me and calculate the distance. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                // Please give me a response with a JSON format with the following fields: a JSON object with the field Warehouse_Info containing the following fields:
                // Station_Name, Address, City, State, Approximate_Distance, Regular_Gas, Premium_Gas, and the 2nd field named Prompt_Response being a user-friendly message containing all
                // of the necessary information about that warehouse using all the information from the Warehouse_Info field.  
                // Also, make sure Station_Name matches exactly the name that was provided in the list of stations.`
                break;
    
            // Find appropriate gas type
            case 2:
                let carBrand = firstResponse.Car_Brand;
                messageContent = `I am a user who is trying to refuel their car. My current address is ${address}. My current car brand is ${carBrand}. 
                You are an advanced search engine, give me the appropriate gas type for my car and a
                nearby Costco gas station so I can refuel. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                Please give me a response with a JSON format with the following fields: a JSON object with the field Warehouse_Info containing the following fields: 
                Station_Name, Address, City, State, Recommended_Gas, Gas_Price, and the 2nd field named Prompt_Response being a user-friendly message containing all
                of the necessary information about that warehouse using all the information from the Warehouse_Info field.  
                Also, make sure Station_Name matches exactly the name that was provided in the list of stations. Gas_Price should be the corresponding price of the recommended gas type.`
                break;
    
            // Get gas trends, mermaidJS chart?
            case 3:
                messageContent = `I am a user in Orange County who would like to know about the trend of gas prices in this region. You are an advanced search \
                engine, generate all of the gas prices for all the Costco gas stations within the past week. Here is the list of Costco gas stations in Southern California: ${JSON.stringify(warehouseList)}. \
                Please give me a response with a JSON format with the following fields: Station_Name, Address, City, State, Gas_Trend.
                Also, make sure Station_Name matches exactly the name that was provided in the list of stations.`
                break;
        }
        chatCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{"role": "user", "content": messageContent}],
        });
        res.send(chatCompletion.choices[0].message.content);    
    }

})

const port = 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});