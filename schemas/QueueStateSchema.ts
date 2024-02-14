import mongoose from 'mongoose';

const queue_state_schema = new mongoose.Schema({
    queue_id: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    }
});

export default mongoose.model('QueueState', queue_state_schema);