import mongoose from 'mongoose';

export const AnnouncementSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    until: {
        type: Number,
        required: false,
    }
});

const queue_state_schema = new mongoose.Schema({
    queue_id: {
        type: String,
        required: true
    },
    announcements: {
        type: Map,
        of: AnnouncementSchema,
        default: {}
    },
    state: {
        type: String,
        required: true
    }
});

export default mongoose.model('QueueState', queue_state_schema);