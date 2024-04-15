import express, {Request, Response, NextFunction} from 'express';
import { OAuth2Client, GoogleAuth } from "google-auth-library"
import jwt from 'jsonwebtoken';
import axios from 'axios';
import {get_user_from_token} from "../services/authentication";

const router = express.Router();

export default router;