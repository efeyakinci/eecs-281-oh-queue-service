import moment from "moment/moment";
import {User} from "../request_types/request_types";
import {IsSameItem} from "./OHQueue";

export class Student {
    name: string;
    uniqname: string;
    attributes: {
        sign_up_time: moment.Moment;
        helped_today: boolean;
        time_requested?: number;
        help_description?: string;
        location?: string;
    };
    top_attributes: {
        being_helped: boolean;
        in_waiting_room: boolean;
        is_online: boolean;
    };

    constructor(params : Student) {
        this.name = params.name;
        this.uniqname = params.uniqname;
        this.attributes = params.attributes;
        this.top_attributes = params.top_attributes;
    }

    toString() {
        return `${this.name} (${this.uniqname}), ${this.attributes.help_description} ${this.top_attributes.being_helped ? "being helped" : "not being helped"}, ${this.top_attributes.in_waiting_room ? "pinned" : "not pinned"}`;
    }
}


export class StudentIsSameItem implements IsSameItem<Student> {
    is_same_item(item1: Student, item2: Student): boolean {
        return item1.uniqname === item2.uniqname;
    }
}