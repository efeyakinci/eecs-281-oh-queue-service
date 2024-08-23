import {OHQueue} from "./OHQueue";
import {DefaultPrioritizer} from "./Priorititizers";
import {StudentAnonymiser} from "./Anonymisers";
import {GoogleCalendar, OHSchedule} from "./OHSchedule";
import { z } from "zod";
import YAML from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import {Student, StudentIsSameItem} from "./QueueTypes";
import { queue_schema, QueueData, staff_schema, StaffData } from "./QueueSchemas";

class QueueManager {
 queues: Map<string, OHQueue<Student>> = new Map<string, OHQueue<Student>>();

 add_queue(queue: OHQueue<Student>): void {
     this.queues.set(queue.queue_id, queue);
 }
}


const queueManager = new QueueManager();


const queue_data_path = path.join(process.cwd(), "data", "queues", "queues.yaml");
const staff_file_path = path.join(process.cwd(), "data", "staff-files", "staff.yaml");

const queue_data: QueueData = YAML.parse(fs.readFileSync(queue_data_path, 'utf8'));
const staff_data: StaffData = YAML.parse(fs.readFileSync(staff_file_path, 'utf8'));

queue_schema.parse(queue_data);
staff_schema.parse(staff_data);

const comparatorOverride = (item1: Student, item2: Student) => {
    const assign_priority = (item: Student) => {
        if (item.attributes.in_waiting_room && item.attributes.being_helped) {
            return 1;
        }
        if (item.attributes.in_waiting_room) {
            return 0;
        }
        if (item.attributes.being_helped) {
            return 2;
        }
        if (item.attributes.helped_today) {
            return 99;
        }

        return 50;
    }

    const item1_priority = assign_priority(item1);
    const item2_priority = assign_priority(item2);

    return item1_priority > item2_priority;
}

Object.entries(queue_data).forEach(([class_id, queue_class]) => {
    Object.entries(queue_class.queues).forEach(([queue_id, queue]) => {
        const schedule = new OHSchedule({
            calendar: new GoogleCalendar(queue.calendar_url), 
            event_regex: new RegExp(queue.schedule_item_regex)
        });

        if (!staff_data[class_id]) {
            throw new Error(`No staff entry found for ${class_id}`);
        }

        queueManager.add_queue(new OHQueue<Student>(`${class_id}-${queue_id}`, {
            class_name: queue_class.name,
            queue_name: queue.name,
            prioritizer: new DefaultPrioritizer(),
            anonymiser: new StudentAnonymiser(),
            is_same_item: new StudentIsSameItem(),
            calendar: schedule,
            override_less_than: comparatorOverride,
            staff: new Set(staff_data[class_id])
        }));
    });
});

console.log(`[Queue Manager] Initialized with ${queueManager.queues.size} queues.`)

export default queueManager;