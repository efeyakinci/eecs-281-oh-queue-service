import crypto from 'crypto';
import {OHSchedule, ScheduleOverride} from "./OHSchedule.js";
import QueueStateModel from "../schemas/QueueStateSchema.js";
import {User} from "../request_types/request_types.js";

export interface Anonymiser<T> {
    anonymise(item: T): T;

    should_anonymise_to(item: T,user: User | undefined): boolean;
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

export interface QueueParams<T> {
    queue_name: string;
    prioritizer: Prioritizer<T>;
    anonymiser: Anonymiser<T>;
    is_same_item: IsSameItem<T>;
    calendar: OHSchedule;
    override_less_than: (item1: T, item2: T) => boolean;
}


export class OHQueue<T> {
    queue_id: string;
    queue_name: string;
    queue: QueueItem<T>[];
    prioritizer: Prioritizer<T>;
    anonymiser: Anonymiser<T>;
    is_same_item: IsSameItem<T>;
    uid_to_item: Map<string, QueueItem<T>>;

    calendar: OHSchedule;

    queue_state_changed: boolean = false;

    item_comparator: (a: QueueItem<T>, b: QueueItem<T>) => number;

    constructor(queue_id: string, queue_params: QueueParams<T>) {
        this.queue_id = queue_id;
        this.queue = [];
        this.queue_name = queue_params.queue_name;
        this.prioritizer = queue_params.prioritizer;
        this.anonymiser = queue_params.anonymiser;
        this.is_same_item = queue_params.is_same_item;
        this.calendar = queue_params.calendar;
        this.uid_to_item = new Map();

        this.item_comparator = (a: QueueItem<T>, b: QueueItem<T>) => {
            if (queue_params.override_less_than(a.item, b.item)) {
                return 1;
            }
            else if (queue_params.override_less_than(b.item, a.item)) {
                return -1;
            }
            else {
                return this.prioritizer.assign_priority(a.item) - this.prioritizer.assign_priority(b.item);
            }
        };

        this.load_queue_state();

        setInterval(this.save_queue_state.bind(this), 1000 * 30);
    }

    enqueue(queuer: T): string {
        const queue_item = new QueueItem(queuer);

        this.queue.push(queue_item);
        this.reorder_queue();

        this.uid_to_item.set(queue_item.id, queue_item);

        this.queue_state_changed = true;
        return queue_item.id;
    }

    reorder_queue() {
        this.queue.sort(this.item_comparator);
        this.queue_state_changed = true;
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

        this.queue_state_changed = true;
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

    clear_queue(): string[] {
        const removed_ids = this.queue.map((queue_item) => queue_item.id);
        this.queue = [];
        this.uid_to_item.clear();

        this.queue_state_changed = true;
        return removed_ids;
    }

    get_item_matching(pred: (item: T) => boolean): QueueItem<T> | undefined {
        const item = this.queue.find((queue_item) => pred(queue_item.item));
        if (!item) {
            return undefined;
        }

        return item;
    }

    is_open() {
        return this.calendar.is_open();
    }

    add_schedule_override(override: ScheduleOverride) {
        this.calendar.set_schedule_override(override);
        this.queue_state_changed = true;
    }

    clear_schedule_override() {
        this.calendar.clear_schedule_override();
        this.queue_state_changed = true;
    }

    save_queue_state() {
        if (!this.queue_state_changed) {
            return;
        }

        this.queue_state_changed = false;

        QueueStateModel.findOneAndUpdate({queue_id: this.queue_id}, {
            queue_id: this.queue_id,
            state: JSON.stringify(this.queue)

        }, {upsert: true}).then(() => {
            console.log(`Saved queue state for ${this.queue_id}`);
        });
    }

    load_queue_state() {
        QueueStateModel.findOne({queue_id: this.queue_id}).then((queue_state) => {
            if (!queue_state) {
                return;
            }

            this.queue = JSON.parse(queue_state.state);
            this.queue.forEach((item) => {
                this.uid_to_item.set(item.id, item);
            });
        });
    }

    async sync_calendar() {
        await this.calendar.sync_to_calendar();
    }
}