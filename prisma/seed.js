import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
export async function seedDatabase() {
    const passwordHash = await bcrypt.hash("Password123!", 12);
    const brandUser = await prisma.user.create({
        data: {
            email: "brand@drcollab.test",
            passwordHash,
            authProvider: "EMAIL",
            role: "BRAND",
            brandProfile: {
                create: {
                    companyName: "Northstar Fitness",
                    websiteUrl: "https://northstar.example",
                    niche: "Fitness",
                    employeeSize: "11-50",
                    role: "Marketing",
                    businessDescription: "Northstar makes training gear for home and gym workouts.",
                    socialLinks: { instagram: "https://instagram.com/northstar", platforms: "Instagram, YouTube" },
                    onboardingComplete: true,
                },
            },
        },
        include: { brandProfile: true },
    });
    const creators = [
        {
            email: "creator@drcollab.test",
            name: "Aanya Shah",
            city: "Mumbai",
            niche: "Fitness",
            bio: "Strength training and product storytelling for fitness brands.",
            platforms: ["Instagram", "YouTube"],
            followers: { Instagram: 82000, YouTube: 24000 },
            total: 106000,
            engagement: 4.8,
            pricing: 2500000,
        },
        {
            email: "mira@drcollab.test",
            name: "Mira Kapoor",
            city: "Bengaluru",
            niche: "Beauty",
            bio: "Skincare routines and honest product reviews.",
            platforms: ["Instagram", "Facebook"],
            followers: { Instagram: 45000, Facebook: 12000 },
            total: 57000,
            engagement: 5.4,
            pricing: 1800000,
        },
        {
            email: "dev@drcollab.test",
            name: "Dev Iyer",
            city: "Chennai",
            niche: "Tech",
            bio: "Short explainers for gadgets and apps.",
            platforms: ["YouTube"],
            followers: { YouTube: 150000 },
            total: 150000,
            engagement: 3.9,
            pricing: 4000000,
        },
        {
            email: "leela@drcollab.test",
            name: "Leela Nair",
            city: "Kochi",
            niche: "Food",
            bio: "Home recipes and kitchen product features.",
            platforms: ["Instagram"],
            followers: { Instagram: 8000 },
            total: 8000,
            engagement: 6.1,
            pricing: 800000,
        },
    ];
    for (const creator of creators) {
        await prisma.user.create({
            data: {
                email: creator.email,
                passwordHash,
                authProvider: "EMAIL",
                role: "CREATOR",
                creatorProfile: {
                    create: {
                        name: creator.name,
                        city: creator.city,
                        niche: creator.niche,
                        bio: creator.bio,
                        socialPlatforms: creator.platforms,
                        socialLinks: { instagram: "https://instagram.com/example" },
                        followerCounts: creator.followers,
                        totalFollowers: creator.total,
                        engagementRate: creator.engagement,
                        pricing: creator.pricing,
                        onboardingComplete: true,
                    },
                },
            },
        });
    }
    const brandId = brandUser.brandProfile.id;
    const end = new Date();
    end.setDate(end.getDate() + 30);
    await prisma.campaign.createMany({
        data: [
            {
                brandId,
                title: "Home gym launch",
                productName: "Northstar Band Set",
                productDetails: "A set of resistance bands for full-body workouts.",
                description: "Looking for a creator to show a week of workouts using the band set.",
                campaignType: "PUBLIC",
                niche: "Fitness",
                platform: "Instagram, YouTube",
                platforms: ["Instagram", "YouTube"],
                priceRange: "10k-20k",
                estimatedPrice: 1000000,
                creatorSlots: 2,
                startDate: new Date(),
                endDate: end,
                deliverables: "1 reel and 3 stories",
                requirements: "Show the product in a real workout. Include the offer code in the caption.",
                performanceTerms: "₹50 per 1,000 views after 30 days, paid directly by the brand.",
                status: "OPEN",
            },
            {
                brandId,
                title: "Private coach series",
                productName: "Northstar Coaching",
                productDetails: "A four-week coaching plan.",
                description: "A private invitation for one creator to document the coaching plan.",
                campaignType: "PRIVATE",
                niche: "Fitness",
                platform: "YouTube",
                platforms: ["YouTube"],
                priceRange: "50k-1l",
                estimatedPrice: 5000000,
                creatorSlots: 1,
                startDate: new Date(),
                endDate: end,
                deliverables: "1 YouTube video",
                requirements: "Walk through the first week of the plan.",
                status: "OPEN",
            },
        ],
    });
}
const direct = process.argv[1]?.replaceAll("\\", "/").includes("prisma/seed");
if (direct) {
    seedDatabase()
        .then(async () => {
        await prisma.$disconnect();
    })
        .catch(async (error) => {
        console.error(error instanceof Error ? error.message : error);
        await prisma.$disconnect();
        process.exit(1);
    });
}
