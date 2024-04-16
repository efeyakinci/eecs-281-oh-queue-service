import moment from "moment/moment";
import {User} from "../request_types/request_types";
import {IsSameItem} from "./OHQueue";
import {OHScheduleStatus} from "./OHSchedule";

export class Student {
    name: string;
    uniqname: string;
    attributes: {
        sign_up_time: moment.Moment;
        helped_today: boolean;
        time_requested?: number;
        help_description?: string;
        location?: string;
        being_helped: boolean;
        in_waiting_room: boolean;
        is_online: boolean;
    };

    constructor(params : Student) {
        this.name = params.name;
        this.uniqname = params.uniqname;
        this.attributes = params.attributes;
    }

    toString() {
        return `${this.name} (${this.uniqname}), ${this.attributes.help_description} ${this.attributes.being_helped ? "being helped" : "not being helped"}, ${this.attributes.in_waiting_room ? "pinned" : "not pinned"}`;
    }
}


export class StudentIsSameItem implements IsSameItem<Student> {
    is_same_item(item1: Student, item2: Student): boolean {
        return item1.uniqname === item2.uniqname;
    }
}

export interface Announcement {
    id: string;
    message: string,
    until?: number
}

export type QueueStatus = {
    announcements?: Announcement[];
} & OHScheduleStatus;