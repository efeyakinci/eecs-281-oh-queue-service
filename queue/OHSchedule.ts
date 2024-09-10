import {google} from 'googleapis';
import moment from "moment";

import dotenv from 'dotenv';

dotenv.config();

const key = JSON.parse(process.env.GOOGLE_CREDS || "");
const creds = google.auth.fromJSON(key);


// @ts-ignore
const calendar = google.calendar({ version: 'v3', auth: creds });

export class GoogleCalendar {
    calendar_id: string;
    items: any[];
    update_listeners: (() => void)[] = [];

    constructor(calendar_id: string) {
        this.calendar_id = calendar_id;
        this.items = [];

        setInterval(this.update_events.bind(this), 1000 * 60 * 30);
        this.update_events();
    }

    get_events() {
        return this.items;
    }

    add_update_listener(listener: () => void) {
        this.update_listeners.push(listener);
    }

    async update_events() {
        const start_of_day = moment().subtract(1, 'minute').toISOString();

        const res = await calendar.events.list({
            calendarId: this.calendar_id,
            timeMin: start_of_day,
            maxResults: 20,
            singleEvents: true,
            orderBy: 'startTime',
        });

        if (!res.data.items) {
            this.items = [];
        } else {
            this.items = res.data.items.map((item: any) => {
                return {
                    start: item.start.dateTime,
                    end: item.end.dateTime,
                    summary: item.summary,
                    location: "location" in item ? item.location : ""
                }
            });
        }
        this.update_listeners.forEach((listener) => listener());
    }

}

export type ScheduleOverride = {
    from_date_time: number;
    to_date_time: number;
    type: "open" | "close";
}

export type OHScheduleStatus = {
    events: any[];
    override?: ScheduleOverride;
}

export class OHSchedule {
    calendar: GoogleCalendar;
    items: {[key: string]: any}[];
    override: ScheduleOverride | undefined;
    event_regex: RegExp;

    constructor({calendar, event_regex}: {calendar: GoogleCalendar, event_regex: RegExp}) {
        this.calendar = calendar;
        this.event_regex = event_regex;
        this.items = [];

        this.calendar.add_update_listener(this.update_items.bind(this));
    }

    update_items() {
        this.items = this.calendar.get_events().filter((event) => this.event_regex.test(event.summary) || this.event_regex.test(event.location));
    }

    async sync_to_calendar() {
        await this.calendar.update_events();
    }

    set_schedule_override(override: ScheduleOverride) {
        this.override = override;
    }

    clear_schedule_override() {
        this.override = undefined;
    }

    get_current_status(): OHScheduleStatus {
        const events: OHScheduleStatus = {
            events: this.items.slice(0, 10),
            override: this.override
        };

        return events;
    }

    is_open() {
        if (this.override && moment().isBetween(moment.unix(this.override.from_date_time), moment.unix(this.override.to_date_time))) {
            return this.override.type === "open";
        }

        const current_event = this.items.find((item) => moment().isBetween(moment(item.start), moment(item.end)));

        return current_event !== undefined;
    }
}