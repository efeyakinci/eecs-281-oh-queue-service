import {Anonymiser} from "./OHQueue";
import {Student} from "./QueueTypes";
import {User} from "../request_types/request_types";

export class StudentAnonymiser implements Anonymiser<Student> {

    anonymise(student: Student): Student {
      const anonymous_student = new Student({
        name: "Anonymous Student",
        uniqname: "",
        attributes: {
            sign_up_time: student.attributes.sign_up_time,
            helped_today: student.attributes.helped_today,
            being_helped: student.attributes.being_helped,
            in_waiting_room: student.attributes.in_waiting_room,
            is_online: student.attributes.is_online
        },
    });

    if (student.attributes.time_requested) {
        anonymous_student.attributes.time_requested = student.attributes.time_requested;
    }
    return anonymous_student;
  }

    should_anonymise_to(item: Student, user: User | undefined, is_staff = false): boolean {
        if (!user) {
            return true;
        }

        return !(user.uniqname === item.uniqname || is_staff);
    }
}