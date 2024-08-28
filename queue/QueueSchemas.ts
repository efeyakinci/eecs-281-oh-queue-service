import { z } from "zod";

const queue_schema_item = z.object({
    name: z.string(),
    schedule_item_regex: z.string(),
    calendar_url: z.string(),
});

export const queue_schema = z.record(
    z.object({
        name: z.string(),
        queues: z.record(queue_schema_item),
    })
);

export const staff_schema = z.record(z.array(z.string()))

export type QueueData = z.infer<typeof queue_schema>;
export type StaffData = z.infer<typeof staff_schema>;