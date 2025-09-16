document.addEventListener('DOMContentLoaded', function() {
    const workoutData = {
        monday: {
            title: "Chest & Triceps",
            exercises: [
                { name: "Barbell Bench Press", sets: "4x6-8", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bench-Press.gif" },
                { name: "Incline Dumbbell Press", sets: "3x8-10", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Press.gif" },
                { name: "Chest Dips", sets: "3x12-15", gif: "https://media1.tenor.com/m/7qFqk839s9wAAAAd/dips.gif" },
                { name: "Skull Crushers", sets: "3x10-12", gif: "https://media1.tenor.com/m/y_Z2oZ35sP8AAAAd/skull-crusher-dumbells.gif" },
                { name: "Triceps Rope Pushdown", sets: "3x12-15", gif: "https://media1.tenor.com/m/mbebKudZjxYAAAAC/tr%C3%ADceps-pulley.gif" },
                { name: "Overhead Dumbbell Extension", sets: "3x12", gif: "https://media1.tenor.com/m/V3J-mg9gH0kAAAAC/seated-dumbbell-triceps-extension.gif" },
            ]
        },
        tuesday: {
            title: "Back & Biceps",
            exercises: [
                { name: "Pull-Ups", sets: "4x8-10", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif" },
                { name: "Barbell Bent Over Row", sets: "4x6-8", gif: "https://media1.tenor.com/m/AYJ_bNXDvoUAAAAd/workout-muscles.gif" },
                { name: "Seated Cable Row", sets: "3x10-12", gif: "https://fitnessprogramer.com/wp-content/uploads/2.gif" },
                { name: "Barbell Curl", sets: "3x10", gif: "https://media1.tenor.com/m/nLodhTy5DjwAAAAd/bodybuilding-biceps.gif" },
                { name: "Incline Dumbbell Curl", sets: "3x12", gif: "https://media1.tenor.com/m/j6wkDQurcm8AAAAd/incline-biceps-curl.gif" },
                { name: "Hammer Curl", sets: "3x12", gif: "https://media1.tenor.com/m/XWnWViXkK1MAAAAC/greeg-sulkin-work-out.gif" },
            ]
        },
        wednesday: {
            title: "Shoulders & Legs",
            exercises: [
                { name: "Seated Dumbbell Press", sets: "4x8-10", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Shoulder-Press.gif" },
                { name: "Lateral Raises", sets: "3x15", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Lateral-Raise.gif" },
                { name: "Rear Delt Fly", sets: "3x12", gif: "https://media1.tenor.com/m/JS3Ru7KZxKkAAAAC/rear-deltt-fly-dumbells.gif" },
                { name: "Barbell Squats", sets: "4x6-8", gif: "https://media1.tenor.com/m/pdMmsiutWkcAAAAC/gym.gif" },
                { name: "Romanian Deadlifts", sets: "3x10", gif: "https://cdn.shopify.com/s/files/1/0449/8453/3153/files/barbell-deadlift_600x600.gif?v=1690860568" },
                { name: "Walking Lunges", sets: "3x12 per leg", gif: "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGx2dTl5enI0eTJnYjZ1dm5seHozcHRlaXN2bGRhamc5a2xudDIwbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xT1XGWnISCovKED3ji/giphy.gif" },
            ]
        },
        thursday: {
            title: "Chest & Triceps (Variation)",
            exercises: [
                { name: "Incline Barbell Press", sets: "4x6-8", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Barbell-Bench-Press.gif" },
                { name: "Flat Dumbbell Press", sets: "3x10", gif: "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXdzM3kyem9nbXJzZGJhNWMyYThpaml0eWJqcDVweGlvanpibGR2ciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l2Je0bLxY7FLirmTK/giphy.gif" },
                { name: "Cable Crossover", sets: "3x15", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Crossover.gif" },
                { name: "Close-Grip Bench Press", sets: "3x8-10", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Close-Grip-Bench-Press.gif" },
                { name: "Dumbbell Kickbacks", sets: "3x12-15", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Kickback.gif" },
                { name: "Overhead Rope Extension", sets: "3x12", gif: "https://burnfit.io/wp-content/uploads/2023/11/CABLE_OHT_EXT.gif" },
            ]
        },
        friday: {
            title: "Back & Biceps (Variation)",
            exercises: [
                { name: "T-Bar Row", sets: "4x8", gif: "https://media1.tenor.com/m/DPfMJrsdpTAAAAAd/t-bar-row.gif" },
                { name: "Wide Grip Lat Pulldown", sets: "3x10", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Lat-Pulldown.gif" },
                { name: "Chest Supported Row", sets: "3x12", gif: "https://media1.tenor.com/m/XgiKCfCQvisAAAAd/chest-supported-row.gif" },
                { name: "Preacher Curl", sets: "3x12", gif: "https://gymvisual.com/img/p/4/8/0/1/4801.gif" },
                { name: "Cable Curl", sets: "3x15", gif: "https://media1.tenor.com/m/GYDvpl2ycIYAAAAd/cable-bicesp-curl.gif" },
                { name: "Concentration Curl", sets: "3x12", gif: "https://media1.tenor.com/m/jaX3EUxaQGkAAAAd/rosca-concentrada-no-banco.gif" },
            ]
        },
        saturday: {
            title: "Shoulders & Legs (Variation)",
            exercises: [
                { name: "Overhead Barbell Press", sets: "4x6-8", gif: "https://media1.tenor.com/m/udvHzqZP_hoAAAAC/standing-barbell-press.gif" },
                { name: "Upright Row", sets: "3x12", gif: "https://gymvisual.com/img/p/2/4/7/9/0/24790.gif" },
                { name: "Dumbbell Lateral Raise", sets: "3 sets dropset", gif: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Lateral-Raise.gif" },
                { name: "Bulgarian Split Squats", sets: "3x10 each leg", gif: "https://media1.tenor.com/m/8dUU3fffAp8AAAAd/db-bulgarian-split-squat.gif" },
                { name: "Leg Press", sets: "3x12", gif: "https://media1.tenor.com/m/yBaS_oBgidsAAAAd/gym.gif" },
                { name: "Leg Curl Machine", sets: "3x15", gif: "https://media1.tenor.com/m/GLaVvK15troAAAAd/seated-leg-curl.gif" },
            ]
        }
    };

    const tabButtons = document.querySelectorAll('.tab-btn');
    const workoutDays = document.querySelectorAll('.workout-day');

    function renderExercises(day) {
        const container = document.querySelector(`#${day} .grid`);
        if (!container) return;

        container.innerHTML = '';
        const dayData = workoutData[day];

        if (dayData && dayData.exercises) {
            dayData.exercises.forEach(exercise => {
                const cardHtml = `
                    <div class="card rounded-2xl overflow-hidden group">
                        <div class="h-64 overflow-hidden bg-black">
                            <img src="${exercise.gif}" alt="${exercise.name}" class="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500">
                        </div>
                        <div class="p-6">
                            <h4 class="font-playfair text-2xl font-bold mb-2" style="color: var(--primary-color);">${exercise.name}</h4>
                            <p class="text-gray-400 font-semibold text-lg">${exercise.sets}</p>
                        </div>
                    </div>
                `;
                container.innerHTML += cardHtml;
            });
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetDay = button.dataset.day;
            
            // Update active button
            document.querySelector('.tab-btn.active').classList.remove('active');
            button.classList.add('active');
            
            // Show correct day section
            workoutDays.forEach(day => day.classList.add('hidden'));
            const activeDay = document.getElementById(targetDay);
            if (activeDay) {
                activeDay.classList.remove('hidden');
                // Render exercises for the active day
                renderExercises(targetDay);
            }
        });
    });

    // Initially render Monday's exercises
    renderExercises('monday');
});
