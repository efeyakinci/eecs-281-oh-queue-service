import { z } from "zod";

export const no_data_schema = z.any();

export const subscribe_schema = z.object({
    queue_id: z.string(),
});

export const unsubscribe_schema = z.object({
    queue_id: z.string(),
});

export const check_if_staff_schema = z.object({
    queue_id: z.string(),
});

export const queue_signup_schema = z.object({
    queue_id: z.string(),
    help_description: z.string(),
    location: z.string(),
    time_requested: z.number().optional(),
});

export const google_login_schema = z.object({
    access_token: z.string(),
});

export const token_login_schema = z.object({
    token: z.string(),
});

export const queue_leave_schema = z.object({
    queue_id: z.string(),
    uid: z.string(),
});

export const queue_item_info_schema = z.object({
    queue_id: z.string(),
    uids: z.array(z.string()),
});

export const request_update_schema = z.object({
    queue_id: z.string(),
});

export const help_student_schema = z.object({
    queue_id: z.string(),
    uid: z.string(),
    is_helped: z.boolean(),
});

export const student_waiting_room_schema = z.object({
    queue_id: z.string(),
    uid: z.string(),
    is_in_waiting_room: z.boolean(),
});

export const student_helped_schema = z.object({
    queue_id: z.string(),
    uid: z.string(),
});

export const send_message_schema = z.object({
    queue_id: z.string(),
    to_uniqname: z.string().regex(/^\w+$/),
    message: z.string(),
});

export const broadcast_message_schema = z.object({
    queue_id: z.string(),
    message: z.string(),
});

export const request_heartbeat_schema = z.object({
    queue_id: z.string(),
    time_to_respond: z.number().positive(),
});

export const heartbeat_schema = z.object({
    request_id: z.array(z.string()),
});

export const update_self_schema = z.object({
    queue_id: z.string(),
    uid: z.string(),
    updated_fields: z.record(z.any()),
});

export const clear_queue_schema = z.object({
    queue_id: z.string(),
});

export const override_queue_schedule_schema = z.object({
    queue_id: z.string(),
    override: z.object({
        from_date_time: z.number(),
        to_date_time: z.number(),
        type: z.enum(["open", "close"]),
    }),
});

export const sync_calendar_schema = z.object({
    queue_id: z.string(),
});

export const add_announcement_schema = z.object({
    queue_id: z.string(),
    message: z.string(),
    until: z.number().optional(),
});

export const remove_announcement_schema = z.object({
    queue_id: z.string(),
    announcement_id: z.string(),
});
