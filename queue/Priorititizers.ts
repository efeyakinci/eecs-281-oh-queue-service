import moment from "moment";

import {Prioritizer, Student} from "./OHQueue.ts";

export class DefaultPrioritizer implements Prioritizer<Student> {
    assign_priority(item: Student): number {
        const seconds_since_signup = moment().diff(item.attributes.sign_up_time, 'seconds');
        const time_requested = item.attributes.time_requested || 0;

        const priority = time_requested * 2 - seconds_since_signup / 60;

        return priority;
    }
}