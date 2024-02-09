import dotenv from "dotenv";
import express from "express";
import {createServer} from "node:http";
import bodyParser from "body-parser";
import cors from "cors";
import {Server} from "socket.io";

dotenv.config();

export const app = express();
export const server = createServer(app);

export const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.use(bodyParser.json());
app.use(cors());