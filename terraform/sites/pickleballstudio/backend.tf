terraform {
  backend "s3" {
    bucket = "browse-dot-show-terraform-state"
    key    = "sites/pickleballstudio/terraform.tfstate"
    region = "us-east-1"
    
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
