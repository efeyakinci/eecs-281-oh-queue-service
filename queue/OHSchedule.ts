import { google } from 'googleapis';
import * as fs from "node:fs";
import moment from "moment";

const key = JSON.parse(fs.readFileSync('token.json', 'utf8'));
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

    private async update_events() {
        const start_of_day = moment().startOf('day').toISOString();

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
                    start: item.start,
                    end: item.end,
                    summary: item.summary
                }
            });
        }
        this.update_listeners.forEach((listener) => listener());
    }

}

export class OHSchedule {
    calendar: GoogleCalendar;
    items: any[];
    is_relevant_item: (item: any) => boolean;

    constructor({calendar, is_relevant_item}: {calendar: GoogleCalendar, is_relevant_item: (item: any) => boolean}) {
        this.calendar = calendar;
        this.is_relevant_item = is_relevant_item;
        this.items = [];

        this.calendar.add_update_listener(this.update_items.bind(this));
    }

    update_items() {
        this.items = this.calendar.get_events().filter(this.is_relevant_item);
    }

    get_current_status() {

        const current_event: any | undefined = this.items.find((item) => {
            const start = moment(item.start.dateTime);
            const end = moment(item.end.dateTime);

            return moment().isBetween(start, end);
        });

        const next_event: any | undefined = this.items.find((item) => {
            const start = moment(item.start.dateTime);

            return start.isAfter(moment());
        });

        return {
            current_event,
            next_event
        };
    }
}