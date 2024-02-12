import mongoose from "mongoose";

const LoginEventSchema = new mongoose.Schema({
    uniqname: {
        type: String,
        required: true
    },
    time: {
        type: Date,
        required: true
    }
});

const SignupEventSchema = new mongoose.Schema({
    uniqname: {
        type: String,
        required: true
    },
    time: {
        type: Date,
        required: true
    }
});

const HelpedEventSchema = new mongoose.Schema({
    uniqname: {
        type: String,
        required: true
    },
    time: {
        type: Date,
        required: true
    }
});

export const LoginEvent = mongoose.model('LoginEvent', LoginEventSchema);
export const SignupEvent = mongoose.model('SignupEvent', SignupEventSchema);
export const HelpedEvent = mongoose.model('HelpedEvent', HelpedEventSchema);