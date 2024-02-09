import Joi from "joi";

export const queue_signup_schema = Joi.object({
    queue_id: Joi.string().required(),
    help_description: Joi.string().required(),
    location: Joi.string().required(),
    time_requested: Joi.number().optional()
});