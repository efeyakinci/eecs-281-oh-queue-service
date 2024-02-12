import Joi from "joi";

export const subscribe_schema = Joi.object({
    queue_id: Joi.string().required()
});

export const unsubscribe_schema = Joi.object({
    queue_id: Joi.string().required()
});

export const queue_signup_schema = Joi.object({
    queue_id: Joi.string().required(),
    help_description: Joi.string().required(),
    location: Joi.string().required(),
    time_requested: Joi.number().optional()
});

export const google_login_schema = Joi.object({
    access_token: Joi.string().required()
});

export const token_login_schema = Joi.object({
    token: Joi.string().required()
});

export const queue_leave_schema = Joi.object({
    queue_id: Joi.string().required(),
    uid: Joi.string().required()
});

export const queue_item_info_schema = Joi.object({
    queue_id: Joi.string().required(),
    uids: Joi.array().items(Joi.string()).required()
});

export const request_update_schema = Joi.object({
    queue_id: Joi.string().required(),
});

export const help_student_schema = Joi.object({
    queue_id: Joi.string().required(),
    uid: Joi.string().required(),
    is_helped: Joi.boolean().required()
});

export const student_waiting_room_schema = Joi.object({
    queue_id: Joi.string().required(),
    uid: Joi.string().required(),
    is_in_waiting_room: Joi.boolean().required()
});

export const student_helped_schema = Joi.object({
    queue_id: Joi.string().required(),
    uid: Joi.string().required(),
});

export const send_message_schema = Joi.object({
    queue_id: Joi.string().required(),
    to_uniqname: Joi.string().alphanum().required(),
    message: Joi.string().required()
});

export const broadcast_message_schema = Joi.object({
    queue_id: Joi.string().required(),
    message: Joi.string().required()
});

export const request_heartbeat_schema = Joi.object({
    queue_id: Joi.string().required(),
    time_to_respond: Joi.number().positive().required()
});

export const heartbeat_schema = Joi.object({
    request_id: Joi.string().required()
});

export const update_self_schema = Joi.object({
    queue_id: Joi.string().required(),
    uid: Joi.string().required(),
    updated_fields: Joi.object().pattern(Joi.string(), Joi.any()).required()
})

export const clear_queue_schema = Joi.object({
    queue_id: Joi.string().required()
});