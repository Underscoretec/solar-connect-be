export const FORM_JSON = {
  "id": "solar_onboarding_v1",
  "title": "Solar Connect Onboarding",
  "version": 1,
  "locale": "en-IN",
  "description": "Structured data collection for solar panel installation",
  "flow": [
    {
      "id": "full_name",
      "required": true,
      "type": "text",
      "order": 1,
      "validation": {
        "minLength": 2,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s'-]+$",
        "errorMessage": "Name should only contain letters, spaces, hyphens, and apostrophes"
      },
      "context": "Used for personalization and official documentation",
      "uiHint": {
        "presentation": "inline",
        "placeholder": "e.g., Rajesh Kumar",
      }
    },
    {
      "id": "phone",
      "type": "text",
      "required": true,
      "order": 2,
      "validation": {
        "pattern": "^\\+?[0-9]{7,15}$",
        "errorMessage": "Enter digits with country code (e.g., +91XXXXXXXXXX)"
      },
      "context": "For installation coordination and updates",
      "uiHint": {
        "presentation": "inline",
        "placeholder": "+91XXXXXXXXXX"
      }
    },
    {
      "id": "How many solar panels do you want to install?",
      "type": "text",
      "required": true,
      "order": 3,
      "context": "For installation coordination and updates",
      "uiHint": {
        "presentation": "inline",
        "placeholder": "1, 2, 3, 4, 5, 6, 7, 8, 9, 10"
      }
    },
    {
      "id": "email",
      "type": "text",
      "required": true,
      "order": 4,
      "validation": {
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
        "errorMessage": "Enter a valid email address"
      },
      "context": "For quotes, documentation, and conversation resumption",
      "uiHint": {
        "presentation": "inline",
        "placeholder": "you@example.com",
      }
    },
    {
      "id": "address",
      "type": "group",
      "required": true,
      "order": 5,
      "context": "Required for site assessment and installation planning",
      "children": [
        {
          "id": "address_line",
          "type": "text",
          "required": true,
          "validation": { "minLength": 3, "maxLength": 200 },
          "uiHint": { "presentation": "inline", "placeholder": "Street, city" }
        },
        {
          "id": "pin_code",
          "type": "text",
          "required": true,
          "validation": {
            "pattern": "^[0-9]{5,7}$",
            "errorMessage": "Enter a valid 5-7 digit PIN code"
          },
          "uiHint": { "presentation": "inline", "placeholder": "560001" }
        },
        {
          "id": "address_country",
          "type": "text",
          "required": false,
          "validation": { "pattern": "^[a-zA-Z\\s'-]+$" },
          "uiHint": { "presentation": "inline", "placeholder": "India" }
        }
      ],
      "uiHint": {
        "presentation": "form_group",
        "hint": "We'll collect your complete address in one go",
        "placeholder": "e.g., 123 Street, Bangalore, 560001"
      }
    },
    {
      "id": "nets_interest",
      "type": "choice",
      "required": true,
      "order": 6,
      "context": "Helps us prepare accurate quote with optional add-ons",
      "uiHint": {
        "presentation": "buttons",
        "options": [
          { "value": "yes", "label": "Yes, I'm interested", "description": "Protects against birds, debris, and weather" },
          { "value": "no", "label": "No, not needed", "description": "Standard installation without nets" }
        ]
      }
    },
    {
      "id": "attachments",
      "type": "group",
      "required": false,
      "order": 7,
      "context": "Optional but highly recommended for precise quotes",
      "children": [
        {
          "id": "site_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 6,
          "maxSize": "10MB",
        },
        {
          "id": "roof_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 6,
          "maxSize": "10MB",
        },
        {
          "id": "angle_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 4,
          "maxSize": "10MB",
        }
      ],
      "uiHint": {
        "presentation": "upload_group",
        "hint": "Photos help our team provide accurate assessment"
      }
    }
  ],

  "completion": {
    "message": "Thank you {name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
    "actions": [
      "create_customer_record",
      "send_confirmation_email",
      "notify_sales_team",
      "close_conversation"
    ],
    "uiHint": { "presentation": "show_summary" }
  }
};