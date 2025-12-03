export const loginSchema = {
    email: {
        isEmail: {
            errorMessage: "Please provide a valid email address",
        },
        notEmpty: {
            errorMessage: "Email is required",
        },
    },
    password: {
        notEmpty: {
            errorMessage: "Password is required",
        },
        isLength: {
            options: { min: 8 },
            errorMessage: "Password must be at least 8 characters",
        },
    },
};

export const signupSchema = {
    name: {
        notEmpty: {
            errorMessage: "Name is required",
        },
        isLength: {
            options: { min: 2, max: 50 },
            errorMessage: "Name must be between 2 and 50 characters",
        },
    },
    email: {
        isEmail: {
            errorMessage: "Please provide a valid email address",
        },
        notEmpty: {
            errorMessage: "Email is required",
        },
    },
    password: {
        notEmpty: {
            errorMessage: "Password is required",
        },
        isLength: {
            options: { min: 8, max: 16 },
            errorMessage: "Password must be between 8 and 16 characters",
        },
    },
};

