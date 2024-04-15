type HeartbeatRequest = {
    request_id: string;
    users_at_risk: Set<string>;
    expiration: Date;
}

const pending_heartbeat_requests = new Map<string, HeartbeatRequest>;

const users_to_queues = new Map<string, Set<string>>();
const users_to_outstanding_heartbeat_requests = new Map<string, Set<string>>();

export {
    pending_heartbeat_requests,
    users_to_queues,
    users_to_outstanding_heartbeat_requests
}