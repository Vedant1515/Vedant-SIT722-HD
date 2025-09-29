variable "prefix" {
  description = "Lowercase short prefix starting with a letter (letters/numbers). Example: newsflow"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "australiaeast"
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "staging"
}
