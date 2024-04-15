import {OHQueue} from "./OHQueue";
import {DefaultPrioritizer} from "./Priorititizers";
import {StudentAnonymiser} from "./Anonymisers";
import {GoogleCalendar, OHSchedule} from "./OHSchedule";
import fs from "node:fs";
import * as path from "node:path";
import {Student, StudentIsSameItem} from "./QueueTypes";

class QueueManager {
 queues: Map<string, OHQueue<Student>> = new Map<string, OHQueue<Student>>();
 staff: Set<string> = new Set<string>();

 constructor(staff_file: string = "staff.txt") {
     const staff_file_path = process.cwd() + "/data/" + path.basename(staff_file);

     fs.readFile(staff_file_path, 'utf8', (err, data) => {
         if (err) {
             console.error(err);
             return;
         }
         data.split("\n").forEach((line) => {
             this.staff.add(line);
         });
     });
 }

 add_queue(queue_name: string, queue: OHQueue<Student>, staff_file: string): void {
     this.queues.set(queue_name, queue);
 }

 user_is_staff(user: string): boolean {
    return this.staff.has(user);
 }
}

const EECS281_calendar_id = "umich.edu_c8sngos30gjedcda3s9raemaqg@group.calendar.google.com";



const queueManager = new QueueManager();

const queues: {[s: string]: {[s: string]: any}} = {
    "eecs281-bbb": {
        name: "BBB Office Hours",
        staff_file: "staff.txt",
        is_relevant_schedule_item: (item: any) => {
            const lower_summary = item.summary.toLowerCase();
            return lower_summary.includes("bbb") && !lower_summary.includes("proffice");
        }
    },
    "eecs281-ugli": {
        name: "UGLI Office Hours",
        staff_file: "staff.txt",
        is_relevant_schedule_item: (item: any) => {
            const lower_summary = item.summary.toLowerCase();
            return lower_summary.includes("ugli") && !lower_summary.includes("proffice");
        }
    },
    "eecs281-virt": {
        name: "Virtual Office Hours",
        staff_file: "staff.txt",
        is_relevant_schedule_item: (item: any) => {
            const lower_summary = item.summary.toLowerCase();
            return lower_summary.includes("virtual") && !lower_summary.includes("proffice");
        }
    },
    "eecs281-proffice": {
        name: "Proffice Hours",
        staff_file: "staff.txt",
        is_relevant_schedule_item: (item: any) => {
            const lower_summary = item.summary.toLowerCase();
            return lower_summary.includes("proffice");
        }
    }
}

const comparatorOverride = (item1: Student, item2: Student) => {
    if (item1.top_attributes.in_waiting_room != true && item2.top_attributes.in_waiting_room === true) {
        return true;
    } else if (item1.top_attributes.being_helped && item2.top_attributes.in_waiting_room) {
        return true;
    } else if (item1.top_attributes.being_helped != true && item2.top_attributes.being_helped === true) {
        return true;
    } else if (item1.attributes.helped_today && !item2.attributes.helped_today) {
        return true;
    }
    return false;
}

const eecs281_calendar = new GoogleCalendar(EECS281_calendar_id);

for (const queue_name in queues) {
    const schedule = new OHSchedule({
        calendar: eecs281_calendar,
        is_relevant_item: queues[queue_name]['is_relevant_schedule_item']
    });


    queueManager.add_queue(queue_name, new OHQueue<Student>(queue_name, {
        queue_name: queues[queue_name].name,
        prioritizer: new DefaultPrioritizer(),
        anonymiser: new StudentAnonymiser(),
        is_same_item: new StudentIsSameItem(),
        calendar: schedule,
        override_less_than: comparatorOverride
    }), queues[queue_name].staff_file);
}

console.log(`[Queue Manager] Initialized with ${queueManager.queues.size} queues.`)

export default queueManager;