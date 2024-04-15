import {Socket} from "socket.io";
import handlers from "./handlers/handlers";

export const as_response = (event_type: string) => {
    return event_type + ':response';
}


export default function queue_handlers(socket: Socket) {
    handlers.forEach(({event, handler, validation_schema}) => {
        socket.on(event, (data: any, callback?: (data: any) => void) => {
            if (validation_schema) {
                const {error} = validation_schema.validate(data);
                if (error) {
                    console.error(`Error during validation of ${event}: ${error.message}`);
                    return;
                }
            }

            try {
                handler(socket, data, callback);
            } catch (error) {
                if (error instanceof Error) {
                    socket.emit('ERROR', {error: error.message});
                } else {
                    socket.emit('ERROR', {error: 'An error occurred'});
                }
            }
        });
    });
}