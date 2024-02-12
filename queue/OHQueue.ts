import moment from 'moment';
import crypto from 'crypto';
import {User} from "../request_types/request_types.js";
import {OHSchedule} from "./OHSchedule.js";

interface StudentParams {

}


export class Student {
    name: string;
    uniqname: string;
    attributes: {
        sign_up_time: moment.Moment;
        time_requested?: number;
        help_description?: string;
        location?: string;
    };
    top_attributes: {
        being_helped: boolean;
        in_waiting_room: boolean;
    };

    constructor(params : Student) {
        this.name = params.name;
        this.uniqname = params.uniqname;
        this.attributes = params.attributes;
        this.top_attributes = params.top_attributes;
    }

    is_visible_to(user: User | undefined) {
        if (!user) {
            return false;
        }

        return user.uniqname === this.uniqname || user.is_staff;
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

export interface Anonymiser<T> {
    anonymise(item: T): T;
}

export interface IsSameItem<T> {
    is_same_item(item1: T, item2: T): boolean;
}


class QueueItem<T> {
    id: string;
    has_heartbeat: boolean;
    item: T;

    constructor(item: T) {
        this.id = crypto.randomBytes(16).toString('hex');
        this.item = item;
        this.has_heartbeat = true;
    }
}

export interface Prioritizer<T> {
    assign_priority(item: T): number;
}

export interface QueueAddResult {
    uid: string;
    position: number;
}

export class OHQueue<T> {
    queue_name: string;
    queue: QueueItem<T>[];
    prioritizer: Prioritizer<T>;
    anonymiser: Anonymiser<T>;
    is_same_item: IsSameItem<T>;
    uid_to_item: Map<string, QueueItem<T>>;

    calendar: OHSchedule;

    item_comparator: (a: QueueItem<T>, b: QueueItem<T>) => number;

    constructor(queue_name: string,
                prioritizer: Prioritizer<T>,
                calendar: OHSchedule,
                overrideLessThan: (item1: T, item2: T) => boolean,
                anonymiser: Anonymiser<T>,
                is_same_item: IsSameItem<T>) {
        this.queue = [];
        this.queue_name = queue_name;
        this.prioritizer = prioritizer;
        this.anonymiser = anonymiser;
        this.is_same_item = is_same_item;
        this.calendar = calendar;
        this.uid_to_item = new Map();

        this.item_comparator = (a: QueueItem<T>, b: QueueItem<T>) => {
            if (overrideLessThan(a.item, b.item)) {
                return 1;
            }
            else if (overrideLessThan(b.item, a.item)) {
                return -1;
            }
            else {
                return this.prioritizer.assign_priority(a.item) - this.prioritizer.assign_priority(b.item);
            }
        };
    }

    enqueue(queuer: T): string {
        const priority = this.prioritizer.assign_priority(queuer);
        const queue_item = new QueueItem(queuer);

        this.queue.push(queue_item);
        this.reorder_queue();

        this.uid_to_item.set(queue_item.id, queue_item);
        return queue_item.id;
    }

    reorder_queue() {
        this.queue.sort(this.item_comparator);
    }

    id_is_in_queue(id: string): boolean {
        return this.uid_to_item.has(id);
    }

    has_item_matching(pred: (item: T) => boolean): boolean {
        return this.queue.some((queue_item) => pred(queue_item.item));
    }

    remove_item_from_queue(id: string): QueueItem<T> | undefined {
        const index = this.queue.findIndex((item) => item.id === id);
        if (index === -1) {
            return undefined;
        }

        const deleted_item = this.queue.splice(index, 1);
        this.uid_to_item.delete(deleted_item[0].id);

        return deleted_item[0];
    }

    get_item_by_id(id: string): T | undefined {
        const item = this.uid_to_item.get(id);
        if (!item) {
            return undefined;
        }

        return item.item;
    }

    get_anonymiser(): Anonymiser<T> {
        return this.anonymiser;
    }

    update_item(id: string, new_item: T) {
        const index = this.queue.findIndex((item) => item.id === id);
        if (index === -1) {
            return;
        }

        this.queue[index].item = new_item;
        this.reorder_queue();
    }

    get_equal_checker(): IsSameItem<T> {
        return this.is_same_item;
    }

    get_uid_to_indices(): { [key: string]: number } {
        const uid_to_indices: { [key: string]: number } = {};
        this.queue.forEach((item, index) => {
            uid_to_indices[item.id] = index;
        });

        return uid_to_indices;
    }

    remove_items_matching(pred: (item: T) => boolean): QueueItem<T>[] {
        const removed_items: QueueItem<T>[] = [];
        this.queue = this.queue.filter((queue_item) => {
            if (pred(queue_item.item)) {
                removed_items.push(queue_item);
                this.uid_to_item.delete(queue_item.id);
                return false;
            }
            return true;
        });

        this.reorder_queue();
        return removed_items;
    }

    get_status() {
        return this.calendar.get_current_status();
    }

    find_item_where(pred: (item: T) => boolean): QueueItem<T> | undefined {
        const item = this.queue.find((queue_item) => pred(queue_item.item));
        if (!item) {
            return undefined;
        }

        return item;
    }
}