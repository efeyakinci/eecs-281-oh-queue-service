import {Anonymiser, Student} from "./OHQueue.js";

export class StudentAnonymiser implements Anonymiser<Student> {
  anonymise(student: Student): Student {
        // @ts-ignore
      const anonymous_student = new Student({
        name: "Anonymous Student",
        uniqname: "",
        attributes: {
            sign_up_time: student.attributes.sign_up_time,
            helped_today: student.attributes.helped_today,
        },
        top_attributes: {
            being_helped: student.top_attributes.being_helped,
            in_waiting_room: student.top_attributes.in_waiting_room,
            is_online: student.top_attributes.is_online
        }
    });

    if (student.attributes.time_requested) {
        anonymous_student.attributes.time_requested = student.attributes.time_requested;
    }

    return anonymous_student;
  }
}