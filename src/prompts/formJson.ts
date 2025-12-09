export const FORM_JSON = {
  "id": "solar_onboarding_v1",
  "title": "Solar Connect Onboarding",
  "version": 1,
  "locale": "en-IN",
  "description": "Structured data collection for solar panel installation",
  "flow": [
    {
      "order": 1,
      "id": "full_name",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Rajesh Kumar",
      "validation": {
        "minLength": 2,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s'-]+$",
      },
      "context": "Used for personalization and official documentation",
    },
    {
      "order": 2,
      "id": "phone",
      "type": "text",
      "required": true,
      "placeholder": "+91XXXXXXXXXX",
      "validation": {
        "pattern": "^\\+?[0-9]{7,15}$",
      },
      "context": "For installation coordination and updates",
    },
    {
      "order": 3,
      "id": "number_of_solar_panels",
      "type": "text",
      "required": true,
      "placeholder": "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
      "context": "For installation coordination and updates",
    },
    {
      "order": 4,
      "id": "email",
      "type": "text",
      "required": true,
      "placeholder": "you@example.com",
      "validation": {
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
      },
      "context": "For quotes, documentation, and conversation resumption",
    },
    {
      "order": 5,
      "id": "address",
      "type": "form",
      "required": true,
      "placeholder": "e.g., 123 Street, Bangalore, 560001",
      "children": [
        {
          "id": "address_line",
          "type": "text",
          "placeholder": "Street, city",
          "required": true,
          "validation": {
            "minLength": 3,
            "maxLength": 500
          },
        },
        {
          "id": "address_line_2",
          "type": "text",
          "placeholder": "Apartment, suite, etc.",
          "required": false,
        },
        {
          "id": "pin_code",
          "type": "text",
          "placeholder": "560001",
          "required": true,
          "validation": {
            "pattern": "^[0-9]{5,7}$",
          },
        },
        {
          "id": "city",
          "type": "text",
          "placeholder": "Bangalore",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$",
          },
        },
        {
          "id": "state",
          "type": "text",
          "placeholder": "Karnataka",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$",
          },
        },
        {
          "id": "address_country",
          "type": "text",
          "placeholder": "India",
          "required": false,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          },
        }
      ],
      "context": "Required for site assessment and installation planning",
    },
    {
      "order": 6,
      "id": "nets_interest",
      "type": "choice",
      "required": true,
      "placeholder": "Yes or No",
      "options": [
        { "value": "yes", "label": "Yes, I'm interested", },
        { "value": "no", "label": "No, not needed" },
        { "value": "not_sure", "label": "I'm not sure" }
      ],
      "context": "Helps us prepare accurate quote with optional add-ons",
    },
    {
      "order": 7,
      "id": "attachments",
      "type": "files",
      "required": false,
      "placeholder": "Upload photos of your site, roof, and angles",
      "context": "Optional but highly recommended for precise quotes",
      "children": [
        {
          "id": "site_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "roof_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "angle_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "panel_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 2,
          "maxSize": "10MB",
        }
      ],
    },
    {
      "order": 8,
      "id": "panel_company_name",
      "type": "text",
      "required": false,
      "placeholder": "e.g., Sunpower, Tesla, etc.",
      "validation": {
        "minLength": 3,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s]+$",
      },
      "context": "Optional but highly recommended for precise quotes. Which helps us to identify the panel company and their products",
    }
  ],

  "completion": {
    "message": "Thank you {name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
    "actions": [
      "create_customer_record",
      "send_confirmation_email",
      "notify_sales_team",
      "close_conversation",
    ],
    "type": "summary"
  }
};



export const FORM_JSON2 = {
  "id": "solar_onboarding_v1",
  "title": "Solar Connect Onboarding",
  "version": 1,
  "locale": "en-IN",
  "description": "Structured data collection for solar panel installation",
  "flow": [
    {
      "order": 1,
      "id": "full_name",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Rajesh Kumar",
      "validation": {
        "minLength": 2,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s'-]+$",
      },
      "context": "Used for personalization and official documentation",
    },
    // {
    //   "order": 2,
    //   "id": "phone",
    //   "type": "text",
    //   "required": true,
    //   "placeholder": "+91XXXXXXXXXX",
    //   "validation": {
    //     "pattern": "^\\+?[0-9]{7,15}$",
    //   },
    //   "context": "For installation coordination and updates",
    // },
    {
      "order": 3,
      "id": "number_of_solar_panels",
      "type": "text",
      "required": true,
      "placeholder": "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
      "context": "For installation coordination and updates",
    },
    {
      "order": 4,
      "id": "email",
      "type": "text",
      "required": true,
      "placeholder": "you@example.com",
      "validation": {
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
      },
      "context": "For quotes, documentation, and conversation resumption",
    },
    {
      "order": 5,
      "id": "address",
      "type": "form",
      "required": true,
      "placeholder": "e.g., 123 Street, Bangalore, 560001",
      "children": [
        {
          "id": "address_line",
          "type": "text",
          "placeholder": "Street, city",
          "required": true,
          "validation": {
            "minLength": 3,
            "maxLength": 500
          },
        },
        {
          "id": "address_line_2",
          "type": "text",
          "placeholder": "Apartment, suite, etc.",
          "required": false,
        },
        {
          "id": "pin_code",
          "type": "text",
          "placeholder": "560001",
          "required": true,
          "validation": {
            "pattern": "^[0-9]{5,7}$",
          },
        },
        {
          "id": "city",
          "type": "text",
          "placeholder": "Bangalore",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$",
          },
        },
        {
          "id": "state",
          "type": "text",
          "placeholder": "Karnataka",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$",
          },
        },
        {
          "id": "address_country",
          "type": "text",
          "placeholder": "India",
          "required": false,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          },
        }
      ],
      "context": "Required for site assessment and installation planning",
    },
    {
      "order": 6,
      "id": "nets_interest",
      "type": "choice",
      "required": true,
      "placeholder": "Yes or No",
      "options": [
        { "value": "yes", "label": "Yes, I'm interested", },
        { "value": "no", "label": "No, not needed" },
        { "value": "not_sure", "label": "I'm not sure" }
      ],
      "context": "Helps us prepare accurate quote with optional add-ons",
    },
    {
      "order": 7,
      "id": "service_type",
      "type": "choice",
      "required": true,
      "placeholder": "What do you need help with?",
      "options": [
        { "value": "install", "label": "Install Solar on My Home" },
        { "value": "bird_proofing", "label": "Protect Solar Panels from Birds / Nets" },
        { "value": "cleaning_repair", "label": "Cleaning / Repair / Troubleshooting" },
        { "value": "guidance", "label": "Not sure — need guidance" }
      ],
      "context": "Helps us to identify the service type and the next questions to ask",
      "optionFlows": {
        "install": [
          {
            "id": "own_home",
            "type": "choice",
            "required": true,
            "placeholder": "Do you own your home?",
            "options": [
              { "value": "yes", "label": "Yes" },
              { "value": "no", "label": "No" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Ownership affects eligibility and financing options"
          },
          {
            "id": "monthly_bill",
            "type": "choice",
            "required": true,
            "placeholder": "What's your average monthly electric bill?",
            "options": [
              { "value": "under_100", "label": "Under $100" },
              { "value": "100_200", "label": "$100–200" },
              { "value": "200_350", "label": "$200–350" },
              { "value": "above_350", "label": "Above $350" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Used to estimate system size and savings"
          },
          {
            "id": "battery_interest",
            "type": "choice",
            "required": false,
            "placeholder": "Are you interested in a battery backup?",
            "options": [
              { "value": "full", "label": "Yes - whole home backup" },
              { "value": "partial", "label": "Yes - partial backup" },
              { "value": "not_sure", "label": "Not sure" },
              { "value": "no", "label": "No" }
            ],
            "context": "Helps us include battery options in your quote"
          },
          {
            "id": "install_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos of your roof / meter area (optional)",
            "context": "Photos help us design a more accurate solar system layout",
            "children": [
              {
                "id": "roof_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 3,
                "maxSize": "10MB"
              },
              {
                "id": "meter_panel_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 3,
                "maxSize": "10MB"
              }
            ]
          }
        ],

        "bird_proofing": [
          {
            "id": "bird_activity",
            "type": "choice",
            "required": true,
            "placeholder": "How is the bird activity on your roof?",
            "options": [
              { "value": "high", "label": "Yes, a lot" },
              { "value": "low", "label": "Yes, a little" },
              { "value": "none", "label": "No, just prevention" }
            ],
            "context": "Understanding the severity helps choose the right netting solution"
          },
          {
            "id": "panel_count_range",
            "type": "choice",
            "required": false,
            "placeholder": "How many solar panels do you have?",
            "options": [
              { "value": "1_10", "label": "1–10" },
              { "value": "11_20", "label": "11–20" },
              { "value": "21_plus", "label": "21+" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Used for estimating material and labour"
          },
          {
            "id": "roof_type",
            "type": "choice",
            "required": false,
            "placeholder": "What type of roof do you have?",
            "options": [
              { "value": "tile", "label": "Tile" },
              { "value": "asphalt", "label": "Asphalt" },
              { "value": "metal", "label": "Metal" },
              { "value": "flat", "label": "Flat" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Different roofs may need different mounting methods"
          },
          {
            "id": "bird_issue_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos showing bird issues or panel area (optional)",
            "context": "Photos help us understand where nets are needed",
            "children": [
              {
                "id": "panel_area_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 4,
                "maxSize": "10MB"
              },
              {
                "id": "bird_nesting_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 4,
                "maxSize": "10MB"
              }
            ]
          }
        ],

        "cleaning_repair": [
          {
            "id": "issue_type",
            "type": "choice",
            "required": true,
            "placeholder": "What seems to be the issue?",
            "options": [
              { "value": "low_production", "label": "Low production" },
              { "value": "inverter_issue", "label": "Inverter issue" },
              { "value": "damage", "label": "Physical damage" },
              { "value": "cleaning", "label": "Cleaning needed" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Helps us route your request to the right technician"
          },
          {
            "id": "urgency",
            "type": "choice",
            "required": false,
            "placeholder": "How urgent is it?",
            "options": [
              { "value": "asap", "label": "ASAP" },
              { "value": "week", "label": "Within a week" },
              { "value": "not_urgent", "label": "Not urgent" }
            ],
            "context": "Helps us prioritize scheduling"
          },
          {
            "id": "issue_description",
            "type": "text",
            "required": false,
            "placeholder": "Describe the issue briefly (optional)",
            "context": "Any extra detail helps our team prepare before contacting you"
          },
          {
            "id": "issue_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos of the issue (optional)",
            "context": "Photos make it easier to diagnose problems before the visit",
            "children": [
              {
                "id": "panel_issue_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 5,
                "maxSize": "10MB"
              }
            ]
          }
        ],

        "guidance": [
          {
            "id": "guidance_description",
            "type": "text",
            "required": false,
            "placeholder": "Tell us a bit about your home and what you're thinking (optional)",
            "context": "Helps us recommend whether solar, nets, or service is the best fit"
          }
        ]
      }
    },
    {
      "order": 8,
      "id": "attachments",
      "type": "files",
      "required": false,
      "placeholder": "Upload photos of your site, roof, and angles",
      "context": "Optional but highly recommended for precise quotes",
      "children": [
        {
          "id": "site_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "roof_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "angle_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "panel_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 2,
          "maxSize": "10MB",
        }
      ],
    },
    // {
    //   "order": 9,
    //   "id": "panel_company_name",
    //   "type": "text",
    //   "required": false,
    //   "placeholder": "e.g., Sunpower, Tesla, etc.",
    //   "validation": {
    //     "minLength": 3,
    //     "maxLength": 120,
    //     "pattern": "^[a-zA-Z\\s]+$",
    //   },
    //   "context": "Optional but highly recommended for precise quotes. Which helps us to identify the panel company and their products",
    // }
  ],

  "completion": {
    "message": "Thank you {name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
    "actions": [
      "create_customer_record",
      "send_confirmation_email",
      "notify_sales_team",
      "close_conversation",
    ],
    "type": "summary"
  }
};


export const FORM_JSON3 = {
  "id": "solar_onboarding_v1",
  "title": "Solar Connect Onboarding",
  "version": 1,
  "locale": "en-IN",
  "description": "Structured data collection for solar panel installation",
  "flow": [
    {
      "order": 1,
      "id": "full_name",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Rajesh Kumar",
      "validation": {
        "minLength": 2,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s'-]+$"
      },
      "context": "Used for personalization and official documentation"
    },
    // {
    //   "order": 2,
    //   "id": "phone",
    //   "type": "text",
    //   "required": true,
    //   "placeholder": "+91XXXXXXXXXX",
    //   "validation": {
    //     "pattern": "^\\+?[0-9]{7,15}$",
    //   },
    //   "context": "For installation coordination and updates",
    // },
    {
      "order": 3,
      "id": "number_of_solar_panels",
      "type": "text",
      "required": true,
      "placeholder": "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
      "context": "For installation coordination and updates"
    },
    {
      "order": 4,
      "id": "email",
      "type": "text",
      "required": true,
      "placeholder": "you@example.com",
      "validation": {
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
      },
      "context": "For quotes, documentation, and conversation resumption"
    },
    {
      "order": 5,
      "id": "address",
      "type": "form",
      "required": true,
      "placeholder": "e.g., 123 Street, Bangalore, 560001",
      "children": [
        {
          "id": "address_line",
          "type": "text",
          "placeholder": "Street, city",
          "required": true,
          "validation": {
            "minLength": 3,
            "maxLength": 500
          }
        },
        {
          "id": "address_line_2",
          "type": "text",
          "placeholder": "Apartment, suite, etc.",
          "required": false
        },
        {
          "id": "pin_code",
          "type": "text",
          "placeholder": "560001",
          "required": true,
          "validation": {
            "pattern": "^[0-9]{5,7}$"
          }
        },
        {
          "id": "city",
          "type": "text",
          "placeholder": "Bangalore",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          }
        },
        {
          "id": "state",
          "type": "text",
          "placeholder": "Karnataka",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          }
        },
        {
          "id": "address_country",
          "type": "text",
          "placeholder": "India",
          "required": false,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          }
        }
      ],
      "context": "Required for site assessment and installation planning"
    },
    {
      "order": 6,
      "id": "nets_interest",
      "type": "choice",
      "required": true,
      "placeholder": "Yes or No",
      "options": [
        { "value": "yes", "label": "Yes, I'm interested" },
        { "value": "no", "label": "No, not needed" },
        { "value": "not_sure", "label": "I'm not sure" }
      ],
      "context": "Helps us prepare accurate quote with optional add-ons"
    },
    {
      "order": 7,
      "id": "service_type",
      "type": "choice",
      "required": true,
      "placeholder": "What do you need help with?",
      "options": [
        { "value": "install", "label": "Install Solar on My Home" },
        { "value": "bird_proofing", "label": "Protect Solar Panels from Birds / Nets" },
        { "value": "cleaning_repair", "label": "Cleaning / Repair / Troubleshooting" },
        { "value": "guidance", "label": "Not sure — need guidance" }
      ],
      "context": "Helps us to identify the service type and the next questions to ask",
      "optionFlows": {
        "install": [
          {
            "id": "own_home",
            "type": "choice",
            "required": true,
            "placeholder": "Do you own your home?",
            "options": [
              { "value": "yes", "label": "Yes" },
              { "value": "no", "label": "No" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Ownership affects eligibility and financing options"
          },
          {
            "id": "monthly_bill",
            "type": "choice",
            "required": true,
            "placeholder": "What's your average monthly electric bill?",
            "options": [
              { "value": "under_100", "label": "Under $100" },
              { "value": "100_200", "label": "$100–200" },
              { "value": "200_350", "label": "$200–350" },
              { "value": "above_350", "label": "Above $350" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Used to estimate system size and savings"
          },
          {
            "id": "battery_interest",
            "type": "choice",
            "required": false,
            "placeholder": "Are you interested in a battery backup?",
            "options": [
              { "value": "full", "label": "Yes - whole home backup" },
              { "value": "partial", "label": "Yes - partial backup" },
              { "value": "not_sure", "label": "Not sure" },
              { "value": "no", "label": "No" }
            ],
            "context": "Helps us include battery options in your quote"
          },
          {
            "id": "install_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos of your roof / meter area (optional)",
            "context": "Photos help us design a more accurate solar system layout",
            "children": [
              {
                "id": "roof_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 3,
                "maxSize": "10MB"
              },
              {
                "id": "meter_panel_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 3,
                "maxSize": "10MB"
              }
            ]
          }
        ],
        "bird_proofing": [
          {
            "id": "bird_activity",
            "type": "choice",
            "required": true,
            "placeholder": "How is the bird activity on your roof?",
            "options": [
              { "value": "high", "label": "Yes, a lot" },
              { "value": "low", "label": "Yes, a little" },
              { "value": "none", "label": "No, just prevention" }
            ],
            "context": "Understanding the severity helps choose the right netting solution"
          },
          {
            "id": "panel_count_range",
            "type": "choice",
            "required": false,
            "placeholder": "How many solar panels do you have?",
            "options": [
              { "value": "1_10", "label": "1–10" },
              { "value": "11_20", "label": "11–20" },
              { "value": "21_plus", "label": "21+" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Used for estimating material and labour"
          },
          {
            "id": "roof_type",
            "type": "choice",
            "required": false,
            "placeholder": "What type of roof do you have?",
            "options": [
              { "value": "tile", "label": "Tile" },
              { "value": "asphalt", "label": "Asphalt" },
              { "value": "metal", "label": "Metal" },
              { "value": "flat", "label": "Flat" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Different roofs may need different mounting methods"
          },
          {
            "id": "bird_issue_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos showing bird issues or panel area (optional)",
            "context": "Photos help us understand where nets are needed",
            "children": [
              {
                "id": "panel_area_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 4,
                "maxSize": "10MB"
              },
              {
                "id": "bird_nesting_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 4,
                "maxSize": "10MB"
              }
            ]
          }
        ],
        "cleaning_repair": [
          {
            "id": "issue_type",
            "type": "choice",
            "required": true,
            "placeholder": "What seems to be the issue?",
            "options": [
              { "value": "low_production", "label": "Low production" },
              { "value": "inverter_issue", "label": "Inverter issue" },
              { "value": "damage", "label": "Physical damage" },
              { "value": "cleaning", "label": "Cleaning needed" },
              { "value": "not_sure", "label": "Not sure" }
            ],
            "context": "Helps us route your request to the right technician"
          },
          {
            "id": "urgency",
            "type": "choice",
            "required": false,
            "placeholder": "How urgent is it?",
            "options": [
              { "value": "asap", "label": "ASAP" },
              { "value": "week", "label": "Within a week" },
              { "value": "not_urgent", "label": "Not urgent" }
            ],
            "context": "Helps us prioritize scheduling"
          },
          {
            "id": "issue_description",
            "type": "text",
            "required": false,
            "placeholder": "Describe the issue briefly (optional)",
            "context": "Any extra detail helps our team prepare before contacting you"
          },
          {
            "id": "issue_photos",
            "type": "files",
            "required": false,
            "placeholder": "Upload photos of the issue (optional)",
            "context": "Photos make it easier to diagnose problems before the visit",
            "children": [
              {
                "id": "panel_issue_photos",
                "type": "file",
                "required": false,
                "accept": ["image/*"],
                "maxFiles": 5,
                "maxSize": "10MB"
              }
            ]
          }
        ],
        "guidance": [
          {
            "id": "guidance_description",
            "type": "text",
            "required": false,
            "placeholder": "Tell us a bit about your home and what you're thinking (optional)",
            "context": "Helps us recommend whether solar, nets, or service is the best fit"
          }
        ]
      }
    },
    {
      "order": 8,
      "id": "attachments",
      "type": "files",
      "required": false,
      "placeholder": "Upload photos of your site, roof, and angles",
      "context": "Optional but highly recommended for precise quotes",
      "children": [
        {
          "id": "site_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB"
        },
        {
          "id": "roof_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB"
        },
        {
          "id": "angle_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB"
        },
        {
          "id": "panel_photos",
          "type": "file",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 2,
          "maxSize": "10MB"
        }
      ]
    },
    {
      "order": 9,
      "id": "completion_message",
      "type": "static",
      "message": "Thank you {full_name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
      "context": "Final confirmation shown to the user after all questions are answered"
    }
    // {
    //   "order": 10,
    //   "id": "panel_company_name",
    //   "type": "text",
    //   "required": false,
    //   "placeholder": "e.g., Sunpower, Tesla, etc.",
    //   "validation": {
    //     "minLength": 3,
    //     "maxLength": 120,
    //     "pattern": "^[a-zA-Z\\s]+$",
    //   },
    //   "context": "Optional but highly recommended for precise quotes. Which helps us to identify the panel company and their products",
    // }
  ],

  "completion": {
    "message": "Thank you {full_name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
    "actions": [
      "create_customer_record",
      "send_confirmation_email",
      "notify_sales_team",
      "close_conversation"
    ],
    "type": "summary"
  }
};
