import mongoose from "mongoose";

const HelpedRecordSchema = new mongoose.Schema({
    uniqname: {
        type: String,
        required: true
    },
    queue_id: {
        type: String,
        required: true
    },
    helped_at: {
        type: Date,
        required: true
    }
});

export default mongoose.model('HelpedRecord', HelpedRecordSchema);