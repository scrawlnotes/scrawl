// What a new Gym starts with (25 Oct): the moves most used in a gym, each with its muscle group,
// the ones of the person's own program among them; and that program, 3-Day Full Body, part by
// part, as design/gym.md and its mockup have it. Written when the app is set up, never after.

/** A move and its muscle group, one of the template's. */
export const EXERCISES: readonly (readonly [name: string, muscle: string])[] = [
  // Chest
  ['Chest Press Machine', 'Chest'],
  ['Bench Press', 'Chest'],
  ['Incline Bench Press', 'Chest'],
  ['Dumbbell Bench Press', 'Chest'],
  ['Incline Dumbbell Press', 'Chest'],
  ['Dumbbell Fly', 'Chest'],
  ['Pec Deck Machine', 'Chest'],
  ['Cable Crossover', 'Chest'],
  ['Push-up', 'Chest'],
  ['Doorway Chest Stretch', 'Chest'],
  // Back
  ['Lat Pulldown', 'Back'],
  ['Seated Row Machine', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Pull-up', 'Back'],
  ['Assisted Pull-up Machine', 'Back'],
  ['Barbell Row', 'Back'],
  ['One-Arm Dumbbell Row', 'Back'],
  ['Deadlift', 'Back'],
  ['Back Extension', 'Back'],
  ['Lat Stretch', 'Back'],
  // Legs
  ['Leg Press', 'Legs'],
  ['Leg Extension', 'Legs'],
  ['Lying Leg Curl', 'Legs'],
  ['Seated Leg Curl', 'Legs'],
  ['Barbell Squat', 'Legs'],
  ['Goblet Squat', 'Legs'],
  ['Bodyweight Squat', 'Legs'],
  ['Hack Squat', 'Legs'],
  ['Romanian Deadlift', 'Legs'],
  ['Walking Lunge', 'Legs'],
  ['Bulgarian Split Squat', 'Legs'],
  ['Hip Thrust', 'Legs'],
  ['Hip Abductor Machine', 'Legs'],
  ['Hip Adductor Machine', 'Legs'],
  ['Standing Calf Raise', 'Legs'],
  ['Seated Calf Raise', 'Legs'],
  ['Quadriceps Stretch', 'Legs'],
  ['Hamstring Stretch', 'Legs'],
  ['Figure-4 Hip Stretch', 'Legs'],
  // Shoulders
  ['Shoulder Press Machine', 'Shoulders'],
  ['Overhead Press', 'Shoulders'],
  ['Dumbbell Shoulder Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'],
  ['Front Raise', 'Shoulders'],
  ['Reverse Pec Deck', 'Shoulders'],
  ['Face Pull', 'Shoulders'],
  ['Shrug', 'Shoulders'],
  ['Shoulder Circles', 'Shoulders'],
  ['Rear Shoulder Stretch', 'Shoulders'],
  // Arms
  ['Barbell Curl', 'Arms'],
  ['Dumbbell Curl', 'Arms'],
  ['Hammer Curl', 'Arms'],
  ['Preacher Curl Machine', 'Arms'],
  ['Triceps Pushdown', 'Arms'],
  ['Overhead Triceps Extension', 'Arms'],
  ['Dips', 'Arms'],
  // Core
  ['Abdominal Crunch Machine', 'Core'],
  ['Plank', 'Core'],
  ['Side Plank', 'Core'],
  ['Crunch', 'Core'],
  ['Hanging Leg Raise', 'Core'],
  ['Cable Crunch', 'Core'],
  ['Russian Twist', 'Core'],
  // Full body: cardio and the warm-up
  ['Walk or Bike', 'Full body'],
  ['Treadmill', 'Full body'],
  ['Stationary Bike', 'Full body'],
  ['Elliptical', 'Full body'],
  ['Rowing Machine', 'Full body'],
  ['Stair Climber', 'Full body'],
  ['Light Warm-up Set', 'Full body'],
  ['Easy Walk and Breathing', 'Full body'],
  ['Kettlebell Swing', 'Full body'],
];

/** The program a new Gym starts with. */
export const PROGRAM = '3-Day Full Body';
export const PROGRAM_DAYS = ['Mon', 'Wed', 'Fri'];
export const PROGRAM_DURATION = '45–60 min';
export const PROGRAM_NOTES = `**Intensity**
Keep your form to the end of each set, with 1–3 reps in reserve. For the first 2 weeks most moves are 2 sets.

**Progression**
When you reach the top of the range in every set: upper-body machines +1–2.5 kg, Leg Press +2.5–5 kg. If your form breaks, do not add weight.

**Cardio**
On days off, walk for 20–30 min. Aim for 120–150 min a week.
`;

/** An item of the program: its part, its move, and its sets, reps, time, rest and note as they are written. */
export interface ProgramItem {
  part: string;
  exercise: string;
  sets?: string;
  reps?: string;
  time?: string;
  rest?: string;
  note?: string;
}

export const PROGRAM_ITEMS: readonly ProgramItem[] = [
  { part: 'Warm-up', exercise: 'Walk or Bike', time: '5 min', note: 'A pace you can talk at' },
  { part: 'Warm-up', exercise: 'Shoulder Circles', reps: '10–10' },
  { part: 'Warm-up', exercise: 'Bodyweight Squat', reps: '10' },
  { part: 'Warm-up', exercise: 'Light Warm-up Set', sets: '1', note: 'Before the first move' },
  { part: 'Workout', exercise: 'Chest Press Machine', sets: '3', reps: '12', rest: '90 s', note: 'Push at chest height' },
  { part: 'Workout', exercise: 'Lat Pulldown', sets: '3', reps: '12', rest: '90 s', note: 'Pull the bar to your chest' },
  { part: 'Workout', exercise: 'Seated Row Machine', sets: '3', reps: '12', rest: '90 s', note: 'Pull your elbows back' },
  { part: 'Workout', exercise: 'Shoulder Press Machine', sets: '3', reps: '10', rest: '90 s', note: 'Up from shoulder height' },
  { part: 'Workout', exercise: 'Leg Press', sets: '3', reps: '12', rest: '2 min', note: 'Do not lock your knees' },
  { part: 'Workout', exercise: 'Leg Extension', sets: '2', reps: '15', rest: '60 s', note: 'Front of the thigh' },
  { part: 'Workout', exercise: 'Lying Leg Curl', sets: '2', reps: '15', rest: '60 s', note: 'Back of the thigh' },
  { part: 'Workout', exercise: 'Abdominal Crunch Machine', sets: '3', reps: '15', rest: '60 s', note: 'Squeeze your abs' },
  { part: 'Cool-down', exercise: 'Easy Walk and Breathing', time: '2–3 min' },
  { part: 'Cool-down', exercise: 'Doorway Chest Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cool-down', exercise: 'Lat Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cool-down', exercise: 'Rear Shoulder Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cool-down', exercise: 'Quadriceps Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cool-down', exercise: 'Hamstring Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cool-down', exercise: 'Figure-4 Hip Stretch', sets: '1–2', time: '20–30 s' },
  { part: 'Cardio', exercise: 'Walk or Bike', time: '10–15 min', note: 'After the workout' },
];
